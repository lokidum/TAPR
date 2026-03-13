enum AuthStatus { unauthenticated, authenticated, loading }

class AuthState {
  const AuthState({
    this.status = AuthStatus.loading,
    this.userId,
    this.role,
  });

  final AuthStatus status;
  final String? userId;
  final String? role;

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isLoading => status == AuthStatus.loading;

  String get homeRoute => switch (role) {
        'barber' => '/barber/home',
        'studio' => '/studio/dashboard',
        _ => '/discover',
      };

  AuthState copyWith({
    AuthStatus? status,
    String? userId,
    String? role,
  }) {
    return AuthState(
      status: status ?? this.status,
      userId: userId ?? this.userId,
      role: role ?? this.role,
    );
  }
}
