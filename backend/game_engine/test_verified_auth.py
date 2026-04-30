from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import EmailVerificationCode, Room, VerifiedUser


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class VerifiedAuthAPITestCase(APITestCase):
    def test_request_code_sends_email_without_returning_code(self):
        response = self.client.post(
            "/api/auth/request-code/",
            {"email": "Player@Example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "code_sent"})
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(EmailVerificationCode.objects.get().email, "player@example.com")

    def test_verify_code_creates_session_user(self):
        code = EmailVerificationCode.create_for_email("player@example.com")

        response = self.client.post(
            "/api/auth/verify-code/",
            {
                "email": "player@example.com",
                "code": code,
                "display_name": "VerifiedPlayer",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["display_name"], "VerifiedPlayer")
        self.assertTrue(VerifiedUser.objects.filter(display_name="VerifiedPlayer").exists())

        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["user"]["display_name"], "VerifiedPlayer")

    def test_verify_code_blocks_reuse_and_wrong_attempts(self):
        code = EmailVerificationCode.create_for_email("player@example.com")

        first = self.client.post(
            "/api/auth/verify-code/",
            {"email": "player@example.com", "code": code, "display_name": "VerifiedPlayer"},
            format="json",
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            "/api/auth/verify-code/",
            {"email": "player@example.com", "code": code, "display_name": "VerifiedPlayer"},
            format="json",
        )
        self.assertEqual(second.status_code, 400)

    def test_expired_code_is_rejected(self):
        code = EmailVerificationCode.create_for_email("player@example.com")
        login_code = EmailVerificationCode.objects.get()
        login_code.expires_at = timezone.now() - timezone.timedelta(seconds=1)
        login_code.save(update_fields=["expires_at"])

        response = self.client.post(
            "/api/auth/verify-code/",
            {"email": "player@example.com", "code": code, "display_name": "VerifiedPlayer"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_duplicate_verified_display_name_blocked(self):
        VerifiedUser.objects.create(
            email="existing@example.com",
            display_name="TakenName",
            email_verified_at=timezone.now(),
        )
        code = EmailVerificationCode.create_for_email("new@example.com")

        response = self.client.post(
            "/api/auth/verify-code/",
            {"email": "new@example.com", "code": code, "display_name": "TakenName"},
            format="json",
        )

        self.assertEqual(response.status_code, 409)

    def test_unverified_player_cannot_impersonate_verified_name(self):
        VerifiedUser.objects.create(
            email="verified@example.com",
            display_name="ProtectedName",
            email_verified_at=timezone.now(),
        )
        room = Room.objects.create(code="5555", name="Protected")

        response = self.client.post(
            f"/api/rooms/{room.code}/join_game/",
            {"player_name": "ProtectedName", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
