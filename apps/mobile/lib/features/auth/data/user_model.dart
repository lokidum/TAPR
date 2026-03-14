class AuthUser {
  const AuthUser({
    required this.id,
    required this.role,
    this.email,
    this.phone,
  });

  final String id;
  final String role;
  final String? email;
  final String? phone;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      role: json['role'] as String,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
    );
  }
}
