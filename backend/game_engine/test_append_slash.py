"""Regression test for APPEND_SLASH 301-redirect breakage.

When APPEND_SLASH is True (Django default), any request to a URL without a
trailing slash is answered with a 301 redirect to the slash-appended URL. That
redirect silently changes the response status, so status assertions across the
suite (expecting 200/201/400/403/404/503) break with `AssertionError: 301 != ...`.

This test pins the test environment to APPEND_SLASH=False so a missing trailing
slash returns the real status code instead of a redirect. It fails under
APPEND_SLASH=True (gets 301) and passes once the setting is disabled.
"""

from django.test import TestCase


class AppendSlashRedirectTestCase(TestCase):
    def test_missing_trailing_slash_is_not_301_redirect(self):
        """A GET without a trailing slash must return its real status (404),
        not a 301 redirect that would mask real status assertions."""
        response = self.client.get("/health")
        self.assertNotEqual(
            response.status_code,
            301,
            "APPEND_SLASH is redirecting no-trailing-slash URLs to 301; "
            "set APPEND_SLASH=False in the test settings.",
        )
