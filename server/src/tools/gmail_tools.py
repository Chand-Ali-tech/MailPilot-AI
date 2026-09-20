from langchain_core.tools import tool
from src.services.gmail_service import (
    search_emails_service,
    read_email_service,
    get_thread_service,
    create_draft_service,
    send_email_service,
    reply_email_service,
    archive_email_service,
    mark_as_read_service,
    mark_as_unread_service,
    add_label_service,
    delete_email_service,
)


def create_gmail_tools(refresh_token: str, access_token: str | None = None):
    """
    Factory to create user-bound Gmail tools for LangChain agents.
    Reuses existing access_token if provided, falling back to refresh_token as needed.
    """

    @tool
    def search_emails(
        query: str,
        max_results: int = 5,
    ):
        """
        Search Gmail messages using standard Gmail search syntax.
        Examples of queries:
          - 'is:unread'
          - 'from:john@example.com'
          - 'subject:invoice'
          - 'after:2026/09/01'
        Examples: 'is:unread', 'from:john@example.com', 'subject:invoice', 'label:work'.
        Returns a list of emails with id, thread_id, from, subject, date, and snippet.
        """
        return search_emails_service(
            refresh_token=refresh_token,
            query=query,
            max_results=max_results,
            access_token=access_token,
        )

    @tool
    def read_email(
        message_id: str,
    ):
        """
        Read the full text content, sender, recipient, subject, and date of a specific email by its message_id.
        Use this when the user wants to see the entire body or details of an email found in search.
        """
        return read_email_service(
            refresh_token=refresh_token,
            message_id=message_id,
            access_token=access_token,
        )

    @tool
    def get_thread(
        thread_id: str,
    ):
        """
        Retrieve all messages and full context of a conversation thread by its thread_id.
        Use this to understand the entire conversation history between participants.
        """
        return get_thread_service(
            refresh_token=refresh_token,
            thread_id=thread_id,
            access_token=access_token,
        )

    @tool
    def create_draft(
        to: str,
        subject: str,
        body: str,
    ):
        """
        Create a new draft email in Gmail without sending it immediately.
        Use this when the user wants to prepare or review an email draft first.
        """
        return create_draft_service(
            refresh_token=refresh_token,
            to=to,
            subject=subject,
            body=body,
            access_token=access_token,
        )

    @tool
    def send_email(
        to: str,
        subject: str,
        body: str,
    ):
        """
        Send an email to a recipient.
        Send a brand new email to a recipient. Requires explicit user approval before execution.
        Args:
            to: Destination email address (e.g. 'client@example.com')
            to: Destination email address (e.g. 'alex@example.com')
            subject: The subject line of the email
            body: The text content of the email
            body: The body content of the email
        """
        return send_email_service(
            refresh_token=refresh_token,
            to=to,
            subject=subject,
            body=body,
            access_token=access_token,
        )

    @tool
    def reply_email(
        thread_id: str,
        body: str,
    ):
        """
        Send a reply to an existing email conversation thread by thread_id. Requires explicit user approval before execution.
        Args:
            thread_id: The ID of the conversation thread to reply to
            body: The reply text content
        """
        return reply_email_service(
            refresh_token=refresh_token,
            thread_id=thread_id,
            body=body,
            access_token=access_token,
        )

    @tool
    def archive_email(
        message_id: str,
    ):
        """
        Archive an email message by removing it from the Inbox (removes INBOX label).
        """
        return archive_email_service(
            refresh_token=refresh_token,
            message_id=message_id,
            access_token=access_token,
        )

    @tool
    def mark_as_read(
        message_id: str,
    ):
        """
        Mark a specific email message as read (removes UNREAD label).
        """
        return mark_as_read_service(
            refresh_token=refresh_token,
            message_id=message_id,
            access_token=access_token,
        )

    @tool
    def mark_as_unread(
        message_id: str,
    ):
        """
        Mark a specific email message as unread (adds UNREAD label).
        """
        return mark_as_unread_service(
            refresh_token=refresh_token,
            message_id=message_id,
            access_token=access_token,
        )

    @tool
    def add_label(
        message_id: str,
        label: str,
    ):
        """
        Apply a label (e.g. 'STARRED', 'IMPORTANT', or a custom label name) to an email message.
        """
        return add_label_service(
            refresh_token=refresh_token,
            message_id=message_id,
            label=label,
            access_token=access_token,
        )

    @tool
    def delete_email(
        message_id: str,
    ):
        """
        Move an email message to Trash. Requires explicit user approval before execution.
        """
        return delete_email_service(
            refresh_token=refresh_token,
            message_id=message_id,
            access_token=access_token,
        )

    return [
        search_emails,
        read_email,
        get_thread,
        create_draft,
        send_email,
        reply_email,
        archive_email,
        mark_as_read,
        mark_as_unread,
        add_label,
        delete_email,
    ]
