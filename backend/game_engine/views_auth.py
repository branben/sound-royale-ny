from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import VerifiedUser, EmailVerificationCode
from .serializers import VerifiedUserSerializer, LeaderboardUserSerializer
from .helpers import _normalize_email, _current_verified_user


class RequestLoginCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = _normalize_email(request.data.get("email"))
        if not email:
            return Response({"error": "email is required"}, status=status.HTTP_400_BAD_REQUEST)

        code = EmailVerificationCode.create_for_email(email)
        send_mail(
            "Your Sound Royale login code",
            f"Your Sound Royale verification code is {code}. It expires in 10 minutes.",
            getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@soundroyale.local"),
            [email],
            fail_silently=True,
        )
        return Response({"status": "code_sent"}, status=status.HTTP_200_OK)


class VerifyLoginCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = _normalize_email(request.data.get("email"))
        code = str(request.data.get("code") or "").strip()
        display_name = str(request.data.get("display_name") or "").strip()

        if not email or not code:
            return Response({"error": "email and code are required"}, status=status.HTTP_400_BAD_REQUEST)

        login_code = EmailVerificationCode.objects.filter(email=email).first()
        if not login_code or not login_code.verify(code):
            return Response({"error": "Invalid or expired verification code"}, status=status.HTTP_400_BAD_REQUEST)

        user = VerifiedUser.objects.filter(email=email).first()
        if user is None:
            if not display_name:
                return Response({"error": "display_name is required for new accounts"}, status=status.HTTP_400_BAD_REQUEST)
            if VerifiedUser.objects.filter(display_name__iexact=display_name).exists():
                return Response({"error": "display_name is already taken"}, status=status.HTTP_409_CONFLICT)
            user = VerifiedUser.objects.create(
                email=email,
                display_name=display_name,
                email_verified_at=timezone.now(),
                last_seen_at=timezone.now(),
            )
        else:
            update_fields = ["last_seen_at"]
            if display_name and display_name.lower() != user.display_name.lower():
                if VerifiedUser.objects.filter(display_name__iexact=display_name).exclude(id=user.id).exists():
                    return Response({"error": "display_name is already taken"}, status=status.HTTP_409_CONFLICT)
                user.display_name = display_name
                update_fields.append("display_name")
            if not user.email_verified_at:
                user.email_verified_at = timezone.now()
                update_fields.append("email_verified_at")
            user.last_seen_at = timezone.now()
            user.save(update_fields=update_fields)

        request.session["verified_user_id"] = str(user.id)
        request.session.modified = True
        return Response(VerifiedUserSerializer(user).data, status=status.HTTP_200_OK)


class MeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user = _current_verified_user(request)
        if not user:
            return Response({"user": None}, status=status.HTTP_200_OK)
        user.mark_seen()
        return Response({"user": VerifiedUserSerializer(user).data}, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        request.session.pop("verified_user_id", None)
        request.session.modified = True
        return Response({"status": "logged_out"}, status=status.HTTP_200_OK)


class GlobalLeaderboardView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        users = VerifiedUser.objects.filter(email_verified_at__isnull=False).order_by(
            "-elo_wins", "display_name"
        )[:100]
        return Response({"leaderboard": LeaderboardUserSerializer(users, many=True).data})
