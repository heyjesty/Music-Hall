import os
import requests
from django.shortcuts import redirect
from django.utils import timezone
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from .models import SpotifyToken
from .serializers import SpotifyTokenSerializer

class SpotifyLoginView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        client_id = os.environ.get('SPOTIPY_CLIENT_ID')
        redirect_uri = os.environ.get('SPOTIPY_REDIRECT_URI', 'http://localhost:8000/api/spotify/callback/')
        scope = 'user-read-playback-state user-modify-playback-state streaming user-read-email user-read-private'
        
        # Use state to pass user_id securely through the flow
        state = str(request.user.id)
        
        url = requests.Request('GET', 'https://accounts.spotify.com/authorize', params={
            'scope': scope,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'client_id': client_id,
            'state': state
        }).prepare().url
        
        return Response({'url': url})

class SpotifyCallbackView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        error = request.query_params.get('error')
        state = request.query_params.get('state') # This is our user_id
        
        if error:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        
        client_id = os.environ.get('SPOTIPY_CLIENT_ID')
        client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')
        redirect_uri = os.environ.get('SPOTIPY_REDIRECT_URI', 'http://localhost:8000/api/spotify/callback/')

        response = requests.post('https://accounts.spotify.com/api/token', data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'client_id': client_id,
            'client_secret': client_secret
        }).json()

        access_token = response.get('access_token')
        token_type = response.get('token_type', 'Bearer')
        refresh_token = response.get('refresh_token')
        expires_in = response.get('expires_in')

        if not access_token:
            return Response({'error': 'Failed to get access token', 'details': response}, status=status.HTTP_400_BAD_REQUEST)

        # Retrieve user from state
        from .models import CustomUser
        try:
            user = CustomUser.objects.get(id=state)
            SpotifyToken.objects.update_or_create(
                user=user,
                defaults={
                    'access_token': access_token,
                    'refresh_token': refresh_token,
                    'token_type': token_type,
                    'expires_at': timezone.now() + timedelta(seconds=expires_in)
                }
            )
            # Redirect to frontend success page
            return redirect('http://localhost:3000/api-auth-success') 
        except (CustomUser.DoesNotExist, ValueError):
            # Fallback if state is missing or invalid
            return Response({
                'message': 'Token obtained but user context lost. Please ensure you are logged in.',
                'access_token': access_token,
                'refresh_token': refresh_token
            })

class SpotifyTokenRefreshView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        token = SpotifyToken.objects.filter(user=request.user).first()
        if not token:
            return Response({'error': 'No token found'}, status=status.HTTP_404_NOT_FOUND)
            
        client_id = os.environ.get('SPOTIPY_CLIENT_ID')
        client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')

        response = requests.post('https://accounts.spotify.com/api/token', data={
            'grant_type': 'refresh_token',
            'refresh_token': token.refresh_token,
            'client_id': client_id,
            'client_secret': client_secret
        }).json()

        access_token = response.get('access_token')
        expires_in = response.get('expires_in')

        if access_token:
            token.access_token = access_token
            token.expires_at = timezone.now() + timedelta(seconds=expires_in)
            token.save()
            return Response({'access_token': access_token})
        
        return Response({'error': 'Failed to refresh token'}, status=status.HTTP_400_BAD_REQUEST)
