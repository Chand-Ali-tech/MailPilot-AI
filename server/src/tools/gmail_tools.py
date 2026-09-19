from langchain_core.tools import tool
from src.services.gmail_service import (
    search_emails_service,
    send_email_service,
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
        """
        return search_emails_service(
            refresh_token=refresh_token,
            query=query,
            max_results=max_results,
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
        Args:
            to: Destination email address (e.g. 'client@example.com')
            subject: The subject line of the email
            body: The text content of the email
        """
        return send_email_service(
            refresh_token=refresh_token,
            to=to,
            subject=subject,
            body=body,
            access_token=access_token,
        )

    return [
        search_emails,
        send_email,
    ]
