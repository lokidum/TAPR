import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/core/network/api_exception.dart';
import 'package:tapr/core/network/token_storage.dart';
import 'package:tapr/features/auth/data/user_model.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    ref.read(dioProvider),
    ref.read(tokenStorageProvider),
  );
});

class AuthRepository {
  AuthRepository(this._dio, this._tokenStorage);

  final Dio _dio;
  final TokenStorage _tokenStorage;

  Future<void> requestOtp(String phone) async {
    await _dio.post<Map<String, dynamic>>(
      '/auth/otp/request',
      data: {'phone': phone},
    );
  }

  Future<AuthUser> verifyOtp(String phone, String otp) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      data: {'phone': phone, 'otp': otp},
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    final accessToken = data['accessToken'] as String;
    final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);

    await _tokenStorage.saveAccessToken(accessToken);
    await _saveRefreshTokenFromCookie(response);
    await _tokenStorage.saveUserId(user.id);
    await _tokenStorage.saveRole(user.role);

    return user;
  }

  Future<AuthUser> signInWithApple() async {
    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: [
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
    );

    final fullName = [
      credential.givenName,
      credential.familyName,
    ].where((n) => n != null && n.isNotEmpty).join(' ');

    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/apple',
      data: {
        'identityToken': credential.identityToken,
        if (fullName.isNotEmpty) 'fullName': fullName,
      },
    );

    return _handleAuthResponse(response);
  }

  Future<AuthUser> signInWithGoogle() async {
    final googleSignIn = GoogleSignIn(scopes: ['email']);
    final account = await googleSignIn.signIn();

    if (account == null) {
      throw const AppException(
        message: 'Google sign-in was cancelled.',
        code: 'SIGN_IN_CANCELLED',
      );
    }

    final googleAuth = await account.authentication;
    final idToken = googleAuth.idToken;

    if (idToken == null) {
      throw const AppException(
        message: 'Failed to retrieve Google credentials.',
        code: 'GOOGLE_AUTH_FAILED',
      );
    }

    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/google',
      data: {'idToken': idToken},
    );

    return _handleAuthResponse(response);
  }

  Future<void> logout() async {
    try {
      await _dio.post<Map<String, dynamic>>('/auth/logout');
    } finally {
      await _tokenStorage.clearAll();
    }
  }

  Future<AuthUser> _handleAuthResponse(
    Response<Map<String, dynamic>> response,
  ) async {
    final data = response.data!['data'] as Map<String, dynamic>;
    final accessToken = data['accessToken'] as String;
    final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);

    await _tokenStorage.saveAccessToken(accessToken);
    await _saveRefreshTokenFromCookie(response);
    await _tokenStorage.saveUserId(user.id);
    await _tokenStorage.saveRole(user.role);

    return user;
  }

  Future<void> _saveRefreshTokenFromCookie(
    Response<Map<String, dynamic>> response,
  ) async {
    final cookies = response.headers['set-cookie'];
    if (cookies == null) return;

    for (final cookie in cookies) {
      if (cookie.startsWith('refresh_token=')) {
        final token = cookie.split('=')[1].split(';').first;
        if (token.isNotEmpty) {
          await _tokenStorage.saveRefreshToken(token);
        }
        return;
      }
    }
  }
}
