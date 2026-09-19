import os
import base64
from email.mime.text import MIMEText
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


def search_emails_service(
    refresh_token: str,
    query: str,
    max_results: int = 5,
    access_token: str | None = None,
):
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


def send_email_service(
    refresh_token: str,
    to: str,
    subject: str,
    body: str,
    access_token: str | None = None,
):
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
    }
