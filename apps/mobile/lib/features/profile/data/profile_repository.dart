import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/profile/data/profile_models.dart';

class ProfileRepository {
  ProfileRepository(this._dio);

  final Dio _dio;

  /// GET /users/me — returns user + barberProfile or studioProfile based on role.
  Future<ProfileData> fetchMe() async {
    final response = await _dio.get<Map<String, dynamic>>('/users/me');
    final data = response.data!['data'] as Map<String, dynamic>;
    return ProfileData.fromJson(data);
  }

  /// PATCH /users/me
  Future<void> updateMe({
    String? fullName,
    String? avatarUrl,
  }) async {
    final body = <String, dynamic>{};
    if (fullName != null) body['fullName'] = fullName;
    if (avatarUrl != null) body['avatarUrl'] = avatarUrl;
    await _dio.patch<Map<String, dynamic>>('/users/me', data: body);
  }

  /// POST /users/me/avatar-upload-url — returns presigned upload URL.
  Future<({String uploadUrl, String key, String cdnUrl})> fetchAvatarUploadUrl(
    String fileName,
    String mimeType,
  ) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/users/me/avatar-upload-url',
      data: {'fileName': fileName, 'mimeType': mimeType},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return (
      uploadUrl: data['uploadUrl'] as String,
      key: data['key'] as String,
      cdnUrl: data['cdnUrl'] as String,
    );
  }

  /// DELETE /auth/sessions/all — revoke all sessions.
  Future<void> logout() async {
    await _dio.delete<Map<String, dynamic>>('/auth/sessions/all');
  }

  /// DELETE /users/me — soft delete account.
  Future<void> deleteAccount() async {
    await _dio.delete<Map<String, dynamic>>('/users/me');
  }
}

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.read(dioProvider));
});
