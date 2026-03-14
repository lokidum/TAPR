import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_spacing.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/notifications/data/notification_models.dart';
import 'package:tapr/features/notifications/data/notification_repository.dart';
import 'package:tapr/features/notifications/presentation/notifications_controller.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  Widget build(BuildContext context) {
    final asyncList = ref.watch(notificationsListProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Notifications', style: AppTextStyles.h2),
        actions: [
          TextButton(
            onPressed: () => _markAllAsRead(context),
            child: Text(
              'Mark all as read',
              style: AppTextStyles.body.copyWith(color: AppColors.gold),
            ),
          ),
        ],
      ),
      body: asyncList.when(
        data: (result) {
          final grouped = _groupByTodayEarlier(result.notifications);
          if (grouped.today.isEmpty && grouped.earlier.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.check_circle_outline_rounded,
                    size: 64,
                    color: AppColors.textSecondary.withValues(alpha: 0.6),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    "You're all caught up",
                    style: AppTextStyles.bodySecondary,
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(notificationsListProvider);
              ref.invalidate(unreadCountProvider);
            },
            color: AppColors.gold,
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              children: [
                if (grouped.today.isNotEmpty) ...[
                  _sectionHeader('Today'),
                  ...grouped.today.map((n) => _NotificationTile(
                        notification: n,
                        onTap: () => _onNotificationTap(context, n),
                        onMarkRead: () => _markAsRead(context, n.id),
                      )),
                ],
                if (grouped.earlier.isNotEmpty) ...[
                  _sectionHeader('Earlier'),
                  ...grouped.earlier.map((n) => _NotificationTile(
                        notification: n,
                        onTap: () => _onNotificationTap(context, n),
                        onMarkRead: () => _markAsRead(context, n.id),
                      )),
                ],
              ],
            ),
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
        error: (err, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  err.toString(),
                  style: AppTextStyles.bodySecondary,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.md),
                TextButton(
                  onPressed: () => ref.invalidate(notificationsListProvider),
                  child: const Text('Retry', style: TextStyle(color: AppColors.gold)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  ({List<AppNotification> today, List<AppNotification> earlier})
      _groupByTodayEarlier(List<AppNotification> notifications) {
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    final today = <AppNotification>[];
    final earlier = <AppNotification>[];

    for (final n in notifications) {
      DateTime createdAt;
      try {
        createdAt = DateTime.parse(n.createdAt);
      } catch (_) {
        earlier.add(n);
        continue;
      }
      if (createdAt.isAfter(todayStart) || createdAt.isAtSameMomentAs(todayStart)) {
        today.add(n);
      } else {
        earlier.add(n);
      }
    }

    return (today: today, earlier: earlier);
  }

  Widget _sectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.xs,
      ),
      child: Text(
        title,
        style: AppTextStyles.caption.copyWith(
          color: AppColors.gold,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Future<void> _markAsRead(BuildContext context, String id) async {
    try {
      await ref.read(notificationRepositoryProvider).markAsRead(id);
      ref.invalidate(notificationsListProvider);
      ref.invalidate(unreadCountProvider);
    } catch (_) {}
  }

  Future<void> _markAllAsRead(BuildContext context) async {
    try {
      await ref.read(notificationRepositoryProvider).markAllAsRead();
      ref.invalidate(notificationsListProvider);
      ref.invalidate(unreadCountProvider);
    } catch (_) {}
  }

  void _onNotificationTap(BuildContext context, AppNotification n) {
    if (!n.isRead) {
      _markAsRead(context, n.id);
    }

    final data = n.data ?? {};
    final type = n.type;
    final bookingId = data['bookingId'] as String?;
    final partnershipId = data['partnershipId'] as String?;
    final rentalId = data['rentalId'] as String?;
    final eventId = data['eventId'] as String?;

    if (type == 'BOOKING' && bookingId != null) {
      context.go('/bookings/$bookingId');
    } else if (type == 'PARTNERSHIP_SIGNED' || partnershipId != null) {
      context.go('/barber/legal');
    } else if ((type == 'RENTAL' || type.contains('rental')) && rentalId != null) {
      context.go('/barber/marketplace');
    } else if (type == 'EVENT' && eventId != null) {
      context.go('/events/$eventId');
    }
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.onTap,
    required this.onMarkRead,
  });

  final AppNotification notification;
  final VoidCallback onTap;
  final VoidCallback onMarkRead;

  @override
  Widget build(BuildContext context) {
    final hasUnreadBorder = !notification.isRead;

    return InkWell(
      onTap: () {
        onMarkRead();
        onTap();
      },
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.xs),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border(
            left: BorderSide(
              color: hasUnreadBorder ? AppColors.gold : Colors.transparent,
              width: 4,
            ),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              notification.iconData,
              size: 24,
              color: hasUnreadBorder ? AppColors.gold : AppColors.textSecondary,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    notification.title,
                    style: AppTextStyles.body.copyWith(
                      fontWeight: notification.isRead ? FontWeight.w400 : FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    notification.body,
                    style: AppTextStyles.bodySecondary,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    _timeAgo(notification.createdAt),
                    style: AppTextStyles.caption,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _timeAgo(String createdAt) {
    try {
      final dt = DateTime.parse(createdAt);
      final now = DateTime.now();
      final diff = now.difference(dt);

      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return DateFormat('MMM d').format(dt);
    } catch (_) {
      return '';
    }
  }
}
