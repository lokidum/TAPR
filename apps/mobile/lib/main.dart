import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:tapr/app.dart';
import 'package:tapr/core/services/push_notification_service.dart';
import 'package:tapr/firebase_options.dart';

const _sentryDsn = String.fromEnvironment('SENTRY_DSN', defaultValue: '');
const _environment = String.fromEnvironment('ENVIRONMENT', defaultValue: 'development');

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarBrightness: Brightness.light,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  await PushNotificationService.initialize();

  if (_sentryDsn.isEmpty) {
    debugPrint('Sentry disabled — no DSN provided');
    runApp(
      const ProviderScope(
        child: TaprApp(),
      ),
    );
  } else {
    await SentryFlutter.init(
      (options) {
        options.dsn = _sentryDsn;
        options.environment = _environment;
      },
      appRunner: () => runApp(
        const ProviderScope(
          child: TaprApp(),
        ),
      ),
    );
  }
}
