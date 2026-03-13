import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/auth_interceptor.dart';
import 'package:tapr/core/network/error_interceptor.dart';
import 'package:tapr/core/network/logging_interceptor.dart';
import 'package:tapr/core/network/token_storage.dart';
import 'package:tapr/features/auth/auth_notifier.dart';

const _baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api.tapr.com.au/api/v1',
);

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  final tokenStorage = ref.read(tokenStorageProvider);
  final authNotifier = ref.read(authNotifierProvider.notifier);

  dio.interceptors.addAll([
    AuthInterceptor(
      tokenStorage: tokenStorage,
      dio: dio,
      onAuthFailure: () => authNotifier.setUnauthenticated(),
    ),
    ErrorInterceptor(),
    LoggingInterceptor(),
  ]);

  return dio;
});
