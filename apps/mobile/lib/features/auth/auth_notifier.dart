import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/token_storage.dart';
import 'package:tapr/features/auth/auth_state.dart';

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.read(tokenStorageProvider));
});

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._tokenStorage) : super(const AuthState()) {
    _init();
  }

  final TokenStorage _tokenStorage;
  final RouterRefreshNotifier refreshNotifier = RouterRefreshNotifier();

  Future<void> _init() async {
    final token = await _tokenStorage.getAccessToken();
    if (token != null) {
      final role = await _tokenStorage.getRole();
      final userId = await _tokenStorage.getUserId();
      state = AuthState(
        status: AuthStatus.authenticated,
        userId: userId,
        role: role,
      );
    } else {
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
    refreshNotifier.notify();
  }

  Future<void> setAuthenticated({
    required String userId,
    required String role,
    required String accessToken,
    required String refreshToken,
  }) async {
    await _tokenStorage.saveAccessToken(accessToken);
    await _tokenStorage.saveRefreshToken(refreshToken);
    await _tokenStorage.saveUserId(userId);
    await _tokenStorage.saveRole(role);
    state = AuthState(
      status: AuthStatus.authenticated,
      userId: userId,
      role: role,
    );
    refreshNotifier.notify();
  }

  Future<void> setUnauthenticated() async {
    await _tokenStorage.clearAll();
    state = const AuthState(status: AuthStatus.unauthenticated);
    refreshNotifier.notify();
  }

  void setLoading() {
    state = const AuthState(status: AuthStatus.loading);
    refreshNotifier.notify();
  }
}

class RouterRefreshNotifier extends ChangeNotifier {
  void notify() => notifyListeners();
}
