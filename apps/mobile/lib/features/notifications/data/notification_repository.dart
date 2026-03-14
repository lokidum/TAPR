import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/notifications/data/notification_models.dart';

class NotificationRepository {
  NotificationRepository(this._dio);

  final Dio _dio;

  Future<({List<AppNotification> notifications, int total})> fetchNotifications({
    int page = 1,
    int limit = 50,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/notifications',
      queryParameters: {'page': page, 'limit': limit},
    );

    final data = response.data!['data'] as List<dynamic>;
    final notifications = data
        .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
        .toList();

    final meta = response.data!['meta'] as Map<String, dynamic>?;
    final pagination = meta?['pagination'] as Map<String, dynamic>?;
    final total = pagination != null
        ? (pagination['total'] as num).toInt()
        : notifications.length;

    return (notifications: notifications, total: total);
  }

  Future<int> fetchUnreadCount() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/notifications/unread-count',
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return (data['count'] as num).toInt();
  }

  Future<void> markAsRead(String id) async {
    await _dio.patch<Map<String, dynamic>>('/notifications/$id/read');
  }

  Future<void> markAllAsRead() async {
    await _dio.patch<Map<String, dynamic>>('/notifications/read-all');
  }
}

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  return NotificationRepository(ref.read(dioProvider));
});
