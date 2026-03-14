import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/features/notifications/data/notification_models.dart';
import 'package:tapr/features/notifications/data/notification_repository.dart';

final unreadCountProvider = FutureProvider<int>((ref) async {
  return ref.read(notificationRepositoryProvider).fetchUnreadCount();
});

final notificationsListProvider =
    FutureProvider<({List<AppNotification> notifications, int total})>((ref) async {
  return ref.read(notificationRepositoryProvider).fetchNotifications();
});
