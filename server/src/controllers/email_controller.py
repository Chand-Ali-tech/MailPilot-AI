import base64
import httpx
from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from src.config.database import get_session
from src.controllers.auth_controller import refresh_google_access_token
from src.models.google_connection import GoogleConnection

GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me"


def parse_message_parts(payload: dict):
    """
    Recursively traverses Gmail MIME payload parts to extract plain text, HTML, and attachment metadata.
    """
    body_plain = ""
    body_html = ""
    attachments = []

    def decode_data(data_str: str) -> str:
        try:
            padded = data_str + "=" * (-len(data_str) % 4)
            return base64.urlsafe_b64decode(padded.encode("ASCII")).decode(
                "utf-8", errors="replace"
            )
        except Exception:
            return ""

    mime_type = payload.get("mimeType", "")
    body = payload.get("body", {})
    filename = payload.get("filename", "")

    # Check if this node is an attachment
    if filename and body.get("attachmentId"):
        attachments.append(
            {
                "filename": filename,
                "mime_type": mime_type,
                "size": body.get("size", 0),
                "attachment_id": body.get("attachmentId"),
            }
        )

    # Direct data on body
    if body.get("data"):
        decoded = decode_data(body["data"])
        if mime_type == "text/plain":
            body_plain += decoded
        elif mime_type == "text/html":
            body_html += decoded
        elif not mime_type or mime_type.startswith("text/"):
            body_plain += decoded

    # Traverse child parts
    parts = payload.get("parts", [])
    for part in parts:
        p_mime = part.get("mimeType", "")
        p_body = part.get("body", {})
        p_filename = part.get("filename", "")

        if p_filename and p_body.get("attachmentId"):
            attachments.append(
                {
                    "filename": p_filename,
                    "mime_type": p_mime,
                    "size": p_body.get("size", 0),
                    "attachment_id": p_body.get("attachmentId"),
                }
            )

        if p_body.get("data"):
            decoded = decode_data(p_body["data"])
            if p_mime == "text/plain":
                body_plain += decoded
            elif p_mime == "text/html":
                body_html += decoded

        # Nested parts (e.g. multipart/alternative inside multipart/mixed)
        if "parts" in part:
            sub_plain, sub_html, sub_att = parse_message_parts(part)
            if sub_plain:
                body_plain += ("\n" if body_plain else "") + sub_plain
            if sub_html:
                body_html += ("\n" if body_html else "") + sub_html
            attachments.extend(sub_att)

    return body_plain, body_html, attachments


async def get_email_details(
    message_id: str,
    request: Request,
    session: Session = Depends(get_session),
):
    """
    Fetches the complete details (headers, plain text, HTML body, attachments list)
    for a specific Gmail message ID.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized. Please log in.")

    connection = session.exec(
        select(GoogleConnection).where(GoogleConnection.user_id == user_id)
    ).first()

    if not connection:
        raise HTTPException(
            status_code=404,
            detail="Google account not connected for this user.",
        )

    access_token = connection.access_token
    if not access_token:
        access_token = await refresh_google_access_token(connection, session)

    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {access_token}"}
        detail_url = f"{GMAIL_API_BASE_URL}/messages/{message_id}?format=full"

        res = await client.get(detail_url, headers=headers)

        # Handle token expiration (401)
        if res.status_code == 401:
            access_token = await refresh_google_access_token(connection, session)
            headers = {"Authorization": f"Bearer {access_token}"}
            res = await client.get(detail_url, headers=headers)

        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Failed to fetch email details from Gmail API: {res.text}",
            )

        msg_data = res.json()
        payload = msg_data.get("payload", {})
        headers_list = payload.get("headers", [])
        headers_dict = {h.get("name"): h.get("value") for h in headers_list}

        # Parse body and attachments
        body_plain, body_html, attachments = parse_message_parts(payload)

        # Fallback if plain body is empty but snippet exists
        if not body_plain and not body_html:
            body_plain = msg_data.get("snippet", "")

        label_ids = msg_data.get("labelIds", [])

        return {
            "id": message_id,
            "thread_id": msg_data.get("threadId"),
            "subject": headers_dict.get("Subject", "(No Subject)"),
            "from": headers_dict.get("From", "Unknown"),
            "to": headers_dict.get("To", ""),
            "cc": headers_dict.get("Cc", ""),
            "date": headers_dict.get("Date", ""),
            "snippet": msg_data.get("snippet", ""),
            "body_plain": body_plain,
            "body_html": body_html,
            "attachments": attachments,
            "labels": label_ids,
            "unread": "UNREAD" in label_ids,
        }
