import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/router/route_names.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/features/notifications/presentation/notifications_controller.dart';

class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncCount = ref.watch(unreadCountProvider);

    final count = asyncCount.whenOrNull(data: (c) => c) ?? 0;

    return IconButton(
      icon: Badge(
        isLabelVisible: count > 0,
        label: count > 99
            ? const Text('99+', style: TextStyle(fontSize: 10))
            : Text('$count', style: const TextStyle(fontSize: 10)),
        child: const Icon(Icons.notifications_outlined, color: AppColors.white),
      ),
      onPressed: () => context.goNamed(RouteNames.notifications),
      tooltip: 'Notifications',
    );
  }
}
