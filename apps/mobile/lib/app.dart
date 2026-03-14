import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/constants/app_constants.dart';
import 'package:tapr/core/router/app_router.dart';
import 'package:tapr/core/services/push_notification_service.dart';
import 'package:tapr/core/theme/app_theme.dart';
import 'package:tapr/features/auth/auth_notifier.dart';
import 'package:tapr/features/notifications/presentation/notifications_controller.dart';

class TaprApp extends ConsumerStatefulWidget {
  const TaprApp({super.key});

  @override
  ConsumerState<TaprApp> createState() => _TaprAppState();
}

class _TaprAppState extends ConsumerState<TaprApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _initPush());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      PushNotificationService.handleInitialMessage();
      ref.invalidate(unreadCountProvider);
    }
  }

  Future<void> _initPush() async {
    final pushService = ref.read(pushNotificationServiceProvider);
    await pushService.requestPermissionAndSetup();

    final authState = ref.read(authNotifierProvider);
    if (authState.isAuthenticated) {
      await pushService.registerForCurrentUser();
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);
    ref.listen(authNotifierProvider, (prev, next) {
      if (next.isAuthenticated && (prev == null || !prev.isAuthenticated)) {
        ref.read(pushNotificationServiceProvider).registerForCurrentUser();
      }
    });

    return MaterialApp.router(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      routerConfig: router,
    );
  }
}
