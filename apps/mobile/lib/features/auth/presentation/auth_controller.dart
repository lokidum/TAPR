import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_exception.dart';
import 'package:tapr/core/network/token_storage.dart';
import 'package:tapr/features/auth/auth_notifier.dart';
import 'package:tapr/features/auth/data/auth_repository.dart';
import 'package:tapr/features/auth/data/user_model.dart';

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthScreenState>((ref) {
  return AuthController(
    ref.read(authRepositoryProvider),
    ref.read(authNotifierProvider.notifier),
    ref.read(tokenStorageProvider),
  );
});

class AuthScreenState {
  const AuthScreenState({
    this.isLoading = false,
    this.error,
  });

  final bool isLoading;
  final String? error;

  AuthScreenState copyWith({
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return AuthScreenState(
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : error ?? this.error,
    );
  }
}

class AuthController extends StateNotifier<AuthScreenState> {
  AuthController(this._repository, this._authNotifier, this._tokenStorage)
      : super(const AuthScreenState());

  final AuthRepository _repository;
  final AuthNotifier _authNotifier;
  final TokenStorage _tokenStorage;

  Future<bool> requestOtp(String phone) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      await _repository.requestOtp(phone);
      state = state.copyWith(isLoading: false);
      return true;
    } on AppException catch (e) {
      state = state.copyWith(isLoading: false, error: e.displayMessage);
      return false;
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        error: 'Something went wrong. Please try again.',
      );
      return false;
    }
  }

  Future<bool> verifyOtp(String phone, String otp) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final user = await _repository.verifyOtp(phone, otp);
      await _setAuthenticated(user);
      state = state.copyWith(isLoading: false);
      return true;
    } on AppException catch (e) {
      state = state.copyWith(isLoading: false, error: e.displayMessage);
      return false;
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        error: 'Something went wrong. Please try again.',
      );
      return false;
    }
  }

  Future<bool> signInWithApple() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final user = await _repository.signInWithApple();
      await _setAuthenticated(user);
      state = state.copyWith(isLoading: false);
      return true;
    } on AppException catch (e) {
      state = state.copyWith(isLoading: false, error: e.displayMessage);
      return false;
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        error: 'Something went wrong. Please try again.',
      );
      return false;
    }
  }

  Future<bool> signInWithGoogle() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final user = await _repository.signInWithGoogle();
      await _setAuthenticated(user);
      state = state.copyWith(isLoading: false);
      return true;
    } on AppException catch (e) {
      state = state.copyWith(isLoading: false, error: e.displayMessage);
      return false;
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        error: 'Something went wrong. Please try again.',
      );
      return false;
    }
  }

  void clearError() {
    state = state.copyWith(clearError: true);
  }

  Future<void> _setAuthenticated(AuthUser user) async {
    final accessToken = await _tokenStorage.getAccessToken() ?? '';
    final refreshToken = await _tokenStorage.getRefreshToken() ?? '';

    await _authNotifier.setAuthenticated(
      userId: user.id,
      role: user.role,
      accessToken: accessToken,
      refreshToken: refreshToken,
    );
  }
}
