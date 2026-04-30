import logging
import re


class TokenRedactionFilter(logging.Filter):
    """Redact Discord tokens and secrets from logs."""
    
    # Patterns to redact
    PATTERNS = [
        (r'"access_token":\s*"[^"]+"', '"access_token": "[REDACTED]"'),
        (r'"refresh_token":\s*"[^"]+"', '"refresh_token": "[REDACTED]"'),
        (r'access_token=[^&\s]+', 'access_token=[REDACTED]'),
        (r'refresh_token=[^&\s]+', 'refresh_token=[REDACTED]'),
        (r'Bearer\s+[A-Za-z0-9\._-]+', 'Bearer [REDACTED]'),
        (r'FERNET_KEY=[A-Za-z0-9+/=]+', 'FERNET_KEY=[REDACTED]'),
        (r'DISCORD_CLIENT_SECRET=[A-Za-z0-9+/=]+', 'DISCORD_CLIENT_SECRET=[REDACTED]'),
    ]
    
    def filter(self, record):
        if record.msg:
            record.msg = self.redact(record.msg)
        if record.args:
            record.args = tuple(self.redact(str(arg)) for arg in record.args)
        return record
    
    def redact(self, text):
        """Redact sensitive patterns from text."""
        for pattern, replacement in self.PATTERNS:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        return text


def setup_logging():
    """Configure logging with token redaction filter."""
    # Get all loggers
    for logger_name in ['game_audit', 'django.request', 'game_engine']:
        logger = logging.getLogger(logger_name)
        logger.addFilter(TokenRedactionFilter())
