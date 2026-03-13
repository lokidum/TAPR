import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:tapr/features/auth/auth_state.dart';

const _tokenKey = 'access_token';
const _roleKey = 'user_role';
const _userIdKey = 'user_id';

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(const FlutterSecureStorage());
});

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._storage) : super(const AuthState()) {
    _init();
  }

  final FlutterSecureStorage _storage;
  final RouterRefreshNotifier refreshNotifier = RouterRefreshNotifier();

  Future<void> _init() async {
    final token = await _storage.read(key: _tokenKey);
    if (token != null) {
      final role = await _storage.read(key: _roleKey);
      final userId = await _storage.read(key: _userIdKey);
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
    required String token,
  }) async {
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _roleKey, value: role);
    await _storage.write(key: _userIdKey, value: userId);
    state = AuthState(
      status: AuthStatus.authenticated,
      userId: userId,
      role: role,
    );
    refreshNotifier.notify();
  }

  Future<void> setUnauthenticated() async {
    await _storage.deleteAll();
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
