import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/network/api_client.dart';

/// Top-level handler for background messages. Must be a top-level function.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // No UI in background isolate. Notification is shown by the system.
  // Data is available when user taps.
}

const _androidNotificationChannelId = 'tapr_push';
const _androidNotificationChannelName = 'TAPR Notifications';

final pushNotificationServiceProvider = Provider<PushNotificationService>((ref) {
  return PushNotificationService(ref.read(dioProvider));
});

class PushNotificationService {
  PushNotificationService(this._dio);

  final dynamic _dio;

  static final _localNotifications = FlutterLocalNotificationsPlugin();

  static Future<void> initialize() async {
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
    );
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTapped,
    );

    if (Platform.isAndroid) {
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(
            const AndroidNotificationChannel(
              _androidNotificationChannelId,
              _androidNotificationChannelName,
              importance: Importance.high,
            ),
          );
    }
  }

  static void _onNotificationTapped(NotificationResponse response) {
    final payload = response.payload;
    if (payload != null && payload.isNotEmpty) {
      _navigateFromPayload(payload);
    }
  }

  static void _navigateFromPayload(String payload) {
    // Payload format: "route|param1=value1|param2=value2"
    final parts = payload.split('|');
    if (parts.isEmpty) return;
    final route = parts[0];
    final params = <String, String>{};
    for (var i = 1; i < parts.length; i++) {
      final kv = parts[i].split('=');
      if (kv.length == 2) params[kv[0]] = kv[1];
    }

    final navigatorKey = _navigatorKey;
    if (navigatorKey?.currentContext == null) return;

    switch (route) {
      case 'booking':
        final id = params['id'];
        if (id != null) {
          navigatorKey!.currentContext!.go('/bookings/$id');
        }
        break;
      case 'partnership':
        navigatorKey!.currentContext!.go('/barber/legal');
        break;
      case 'rental':
        navigatorKey!.currentContext!.go('/barber/marketplace');
        break;
      case 'event':
        final id = params['id'];
        if (id != null) {
          navigatorKey!.currentContext!.go('/events/$id');
        }
        break;
      default:
        navigatorKey!.currentContext!.go('/notifications');
    }
  }

  static GlobalKey<NavigatorState>? _navigatorKey;

  static void setNavigatorKey(GlobalKey<NavigatorState> key) {
    _navigatorKey = key;
  }

  /// Call from main.dart after Firebase init. Delays 2 seconds then requests permission.
  Future<void> requestPermissionAndSetup() async {
    await Future<void>.delayed(const Duration(seconds: 2));

    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      await _registerTokenAndListen();
    }
  }

  Future<void> _registerTokenAndListen() async {
    FirebaseMessaging.instance.onTokenRefresh.listen(_registerToken);

    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) {
      await _registerToken(token);
    }

    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);
  }

  void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    final title = notification?.title ?? 'Notification';
    final body = notification?.body ?? '';
    final payload = _buildPayload(message.data);

    _localNotifications.show(
      message.hashCode,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _androidNotificationChannelId,
          _androidNotificationChannelName,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: payload,
    );
  }

  void _handleMessageOpenedApp(RemoteMessage message) {
    final payload = _buildPayload(message.data);
    if (payload.isNotEmpty) {
      _navigateFromPayload(payload);
    } else {
      _navigatorKey?.currentContext?.go('/notifications');
    }
  }

  String _buildPayload(Map<String, dynamic> data) {
    final type = data['type'] as String?;
    if (type == null) return 'notifications';

    return switch (type) {
      'BOOKING' => 'booking|id=${data['bookingId'] ?? ''}',
      'PARTNERSHIP_SIGNED' => 'partnership',
      'LEVEL_UP' => 'barber|home',
      'RENTAL' || 'rental_dispute' => 'rental|id=${data['rentalId'] ?? ''}',
      'EVENT' => 'event|id=${data['eventId'] ?? ''}',
      _ => 'notifications',
    };
  }

  Future<void> _registerToken(String token) async {
    try {
      final platform = Platform.isIOS ? 'ios' : 'android';
      await _dio.post(
        '/notifications/register-device',
        data: {'pushToken': token, 'platform': platform},
      );
    } catch (_) {
      // Ignore — user may not be logged in
    }
  }

  /// Call when user logs in to register the device.
  Future<void> registerForCurrentUser() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) {
      await _registerToken(token);
    }
  }

  /// Call from app lifecycle when app resumes to handle initial message (terminated state).
  static Future<void> handleInitialMessage() async {
    final message = await FirebaseMessaging.instance.getInitialMessage();
    if (message != null) {
      final data = message.data;
      final type = data['type'] as String?;
      String payload = 'notifications';
      if (type == 'BOOKING' && data['bookingId'] != null) {
        payload = 'booking|id=${data['bookingId']}';
      } else if (type == 'PARTNERSHIP_SIGNED') {
        payload = 'partnership';
      } else if (type == 'RENTAL' && data['rentalId'] != null) {
        payload = 'rental|id=${data['rentalId']}';
      } else if (type == 'EVENT' && data['eventId'] != null) {
        payload = 'event|id=${data['eventId']}';
      }
      _navigateFromPayload(payload);
    }
  }
}
