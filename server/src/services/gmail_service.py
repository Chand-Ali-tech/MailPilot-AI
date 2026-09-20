import os
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

load_dotenv()


def get_gmail_service(refresh_token: str, access_token: str | None = None):
    """
    Creates an authenticated Gmail API service client.
    Reuses the access_token if valid; auto-refreshes using refresh_token only when needed.
    """
    credentials = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    )

    return build(
        "gmail",
        "v1",
        credentials=credentials,
        cache_discovery=False,
    )


def _extract_body_from_payload(payload: dict) -> str:
    """Helper to decode text content from message payload."""
    body_text = ""
    if "parts" in payload:
        for part in payload["parts"]:
            mime_type = part.get("mimeType", "")
            if mime_type == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    body_text += base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
            elif "parts" in part:
                body_text += _extract_body_from_payload(part)
    else:
        data = payload.get("body", {}).get("data", "")
        if data:
            body_text = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    return body_text.strip()


def search_emails_service(
    refresh_token: str,
    query: str,
    max_results: int = 5,
    access_token: str | None = None,
):
    """Searches messages matching query and returns high-level summaries."""
    gmail = get_gmail_service(refresh_token, access_token)

    result = (
        gmail.users()
        .messages()
        .list(
            userId="me",
            q=query,
            maxResults=max_results,
        )
        .execute()
    )

    messages = result.get("messages", [])
    emails = []

    for message in messages:
        data = (
            gmail.users()
            .messages()
            .get(
                userId="me",
                id=message["id"],
                format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            )
            .execute()
        )

        payload = data.get("payload", {})
        headers_list = payload.get("headers", [])
        headers = {h["name"]: h["value"] for h in headers_list}

        emails.append(
            {
                "id": data.get("id"),
                "thread_id": data.get("threadId"),
                "from": headers.get("From"),
                "subject": headers.get("Subject"),
                "date": headers.get("Date"),
                "snippet": data.get("snippet"),
            }
        )

    return emails


def read_email_service(
    refresh_token: str,
    message_id: str,
    access_token: str | None = None,
):
    """Retrieves full details and decoded content of a specific email."""
    gmail = get_gmail_service(refresh_token, access_token)

    data = (
        gmail.users()
        .messages()
        .get(
            userId="me",
            id=message_id,
            format="full",
        )
        .execute()
    )

    payload = data.get("payload", {})
    headers_list = payload.get("headers", [])
    headers = {h["name"]: h["value"] for h in headers_list}

    body = _extract_body_from_payload(payload)
    if not body:
        body = data.get("snippet", "")

    return {
        "id": data.get("id"),
        "thread_id": data.get("threadId"),
        "from": headers.get("From"),
        "to": headers.get("To"),
        "subject": headers.get("Subject"),
        "date": headers.get("Date"),
        "body": body,
        "labels": data.get("labelIds", []),
    }


def get_thread_service(
    refresh_token: str,
    thread_id: str,
    access_token: str | None = None,
):
    """Retrieves all messages belonging to a conversation thread."""
    gmail = get_gmail_service(refresh_token, access_token)

    data = (
        gmail.users()
        .threads()
        .get(
            userId="me",
            id=thread_id,
            format="full",
        )
        .execute()
    )

    thread_messages = []
    for msg in data.get("messages", []):
        payload = msg.get("payload", {})
        headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
        body = _extract_body_from_payload(payload) or msg.get("snippet", "")

        thread_messages.append(
            {
                "id": msg.get("id"),
                "from": headers.get("From"),
                "to": headers.get("To"),
                "date": headers.get("Date"),
                "subject": headers.get("Subject"),
                "body": body,
            }
        )

    return {
        "thread_id": thread_id,
        "message_count": len(thread_messages),
        "messages": thread_messages,
    }


def create_draft_service(
    refresh_token: str,
    to: str,
    subject: str,
    body: str,
    access_token: str | None = None,
):
    """Creates a draft email in Gmail without sending it."""
    gmail = get_gmail_service(refresh_token, access_token)

    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    draft = (
        gmail.users()
        .drafts()
        .create(
            userId="me",
            body={"message": {"raw": raw}},
        )
        .execute()
    )

    return {
        "status": "success",
        "draft_id": draft.get("id"),
        "message_id": draft.get("message", {}).get("id"),
        "to": to,
        "subject": subject,
    }


def send_email_service(
    refresh_token: str,
    to: str,
    subject: str,
    body: str,
    access_token: str | None = None,
):
    """Sends a new email."""
    gmail = get_gmail_service(refresh_token, access_token)

    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    result = (
        gmail.users()
        .messages()
        .send(
            userId="me",
            body={"raw": raw},
        )
        .execute()
    )

    return {
        "status": "success",
        "id": result.get("id"),
        "thread_id": result.get("threadId"),
        "to": to,
        "subject": subject,
    }


def reply_email_service(
    refresh_token: str,
    thread_id: str,
    body: str,
    access_token: str | None = None,
):
    """Replies to an existing email conversation thread."""
    gmail = get_gmail_service(refresh_token, access_token)

    # Fetch last message from thread to get Subject and recipient info
    thread = gmail.users().threads().get(userId="me", id=thread_id, format="metadata").execute()
    messages = thread.get("messages", [])
    if not messages:
        raise ValueError(f"Thread {thread_id} not found or empty.")

    last_msg = messages[-1]
    headers = {h["name"]: h["value"] for h in last_msg.get("payload", {}).get("headers", [])}

    recipient = headers.get("Reply-To") or headers.get("From") or ""
    subject = headers.get("Subject", "")
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    message_id_header = headers.get("Message-ID", "")

    message = MIMEText(body)
    message["to"] = recipient
    message["subject"] = subject
    if message_id_header:
        message["In-Reply-To"] = message_id_header
        message["References"] = message_id_header

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    result = (
        gmail.users()
        .messages()
        .send(
            userId="me",
            body={"raw": raw, "threadId": thread_id},
        )
        .execute()
    )

    return {
        "status": "success",
        "id": result.get("id"),
        "thread_id": thread_id,
        "to": recipient,
        "subject": subject,
    }


def modify_labels_service(
    refresh_token: str,
    message_id: str,
    add_labels: list[str] | None = None,
    remove_labels: list[str] | None = None,
    access_token: str | None = None,
):
    """Adds and/or removes labels from an email message."""
    gmail = get_gmail_service(refresh_token, access_token)

    body = {
        "addLabelIds": add_labels or [],
        "removeLabelIds": remove_labels or [],
    }

    result = (
        gmail.users()
        .messages()
        .modify(
            userId="me",
            id=message_id,
            body=body,
        )
        .execute()
    )

    return {
        "status": "success",
        "id": message_id,
        "labels": result.get("labelIds", []),
    }


def archive_email_service(refresh_token: str, message_id: str, access_token: str | None = None):
    """Archives an email by removing the INBOX label."""
    return modify_labels_service(
        refresh_token=refresh_token,
        message_id=message_id,
        remove_labels=["INBOX"],
        access_token=access_token,
    )


def mark_as_read_service(refresh_token: str, message_id: str, access_token: str | None = None):
    """Marks an email as read by removing the UNREAD label."""
    return modify_labels_service(
        refresh_token=refresh_token,
        message_id=message_id,
        remove_labels=["UNREAD"],
        access_token=access_token,
    )


def mark_as_unread_service(refresh_token: str, message_id: str, access_token: str | None = None):
    """Marks an email as unread by adding the UNREAD label."""
    return modify_labels_service(
        refresh_token=refresh_token,
        message_id=message_id,
        add_labels=["UNREAD"],
        access_token=access_token,
    )


def add_label_service(refresh_token: str, message_id: str, label: str, access_token: str | None = None):
    """Adds a custom or system label to a message."""
    return modify_labels_service(
        refresh_token=refresh_token,
        message_id=message_id,
        add_labels=[label],
        access_token=access_token,
    )


def delete_email_service(refresh_token: str, message_id: str, access_token: str | None = None):
    """Moves an email message to Trash."""
    gmail = get_gmail_service(refresh_token, access_token)

    result = (
        gmail.users()
        .messages()
        .trash(
            userId="me",
            id=message_id,
        )
        .execute()
    )

    return {
        "status": "success",
        "action": "trashed",
        "id": result.get("id"),
    }
