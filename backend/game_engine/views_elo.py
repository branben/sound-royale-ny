from django.urls import reverse
from django.db.models import Sum
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import VerifiedUser
from .serializers import EloDeltaEventSerializer, EloSummarySerializer
from .helpers import _current_verified_user


class EloLedgerMeView(APIView):
    """API endpoint for current user's ELO ledger history"""
    
    def get(self, request):
        verified_user = _current_verified_user(request)
        if not verified_user:
            return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Get ledger events with pagination
        page_size = int(request.query_params.get('page_size', 50))
        page = int(request.query_params.get('page', 1))
        
        deltas = verified_user.elo_deltas.all().order_by('-created_at')
        total = deltas.count()
        start = (page - 1) * page_size
        end = start + page_size
        deltas_page = deltas[start:end]
        
        serializer = EloDeltaEventSerializer(deltas_page, many=True)
        
        return Response({
            'results': serializer.data,
            'count': total,
            'page': page,
            'page_size': page_size
        })


class EloSummaryMeView(APIView):
    """API endpoint for current user's ELO summary"""
    
    def get(self, request):
        verified_user = _current_verified_user(request)
        if not verified_user:
            return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Calculate from ledger (source of truth)
        total_delta = verified_user.elo_deltas.aggregate(Sum('delta'))['delta__sum'] or 0
        elo_rating = 1200 + total_delta  # Baseline 1200
        elo_wins = verified_user.elo_deltas.filter(match_result='win').count()
        elo_losses = verified_user.elo_deltas.filter(match_result='loss').count()
        total_deltas = verified_user.elo_deltas.count()
        
        serializer = EloSummarySerializer({
            'elo_rating': elo_rating,
            'elo_wins': elo_wins,
            'elo_losses': elo_losses,
            'elo_matches': total_deltas,
            'total_deltas': total_deltas
        })
        
        return Response(serializer.data)


class EloUserSummaryView(APIView):
    """API endpoint for a specific user's ELO summary (public)"""
    
    def get(self, request, user_id):
        try:
            verified_user = VerifiedUser.objects.get(id=user_id)
        except VerifiedUser.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        
        # Calculate from ledger (source of truth)
        total_delta = verified_user.elo_deltas.aggregate(Sum('delta'))['delta__sum'] or 0
        elo_rating = 1200 + total_delta  # Baseline 1200
        elo_wins = verified_user.elo_deltas.filter(match_result='win').count()
        elo_losses = verified_user.elo_deltas.filter(match_result='loss').count()
        total_deltas = verified_user.elo_deltas.count()
        
        serializer = EloSummarySerializer({
            'elo_rating': elo_rating,
            'elo_wins': elo_wins,
            'elo_losses': elo_losses,
            'elo_matches': total_deltas,
            'total_deltas': total_deltas
        })
        
        return Response(serializer.data)
