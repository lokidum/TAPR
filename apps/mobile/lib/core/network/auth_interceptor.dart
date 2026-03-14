import 'dart:async';

import 'package:dio/dio.dart';
import 'package:tapr/core/network/token_storage.dart';

typedef OnAuthFailure = void Function();

class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.tokenStorage,
    required Dio dio,
    this.onAuthFailure,
  }) : _dio = dio;

  final TokenStorage tokenStorage;
  final Dio _dio;
  final OnAuthFailure? onAuthFailure;

  Completer<String?>? _refreshCompleter;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await tokenStorage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode != 401) {
      handler.next(err);
      return;
    }

    try {
      final newToken = await _tryRefresh();
      if (newToken == null) {
        handler.next(err);
        return;
      }

      final retryOptions = err.requestOptions;
      retryOptions.headers['Authorization'] = 'Bearer $newToken';

      final retryDio = _createRetryDio();
      final retryResponse = await retryDio.fetch<dynamic>(retryOptions);
      handler.resolve(retryResponse);
    } on DioException {
      handler.next(err);
    }
  }

  Future<String?> _tryRefresh() async {
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }

    _refreshCompleter = Completer<String?>();

    try {
      final refreshToken = await tokenStorage.getRefreshToken();
      if (refreshToken == null) {
        await _handleAuthFailure();
        _refreshCompleter!.complete(null);
        return null;
      }

      final refreshDio = _createRefreshDio();
      final response = await refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        options: Options(
          headers: {'Authorization': 'Bearer $refreshToken'},
        ),
      );

      final newAccessToken = response.data?['data']?['accessToken'] as String?;
      final newRefreshToken = _extractRefreshTokenFromCookie(response);

      if (newAccessToken == null) {
        await _handleAuthFailure();
        _refreshCompleter!.complete(null);
        return null;
      }

      await tokenStorage.saveAccessToken(newAccessToken);
      if (newRefreshToken != null) {
        await tokenStorage.saveRefreshToken(newRefreshToken);
      }

      _refreshCompleter!.complete(newAccessToken);
      return newAccessToken;
    } catch (_) {
      await _handleAuthFailure();
      _refreshCompleter!.complete(null);
      return null;
    } finally {
      _refreshCompleter = null;
    }
  }

  Dio _createRefreshDio() {
    final refreshDio = Dio(BaseOptions(
      baseUrl: _dio.options.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));
    refreshDio.httpClientAdapter = _dio.httpClientAdapter;
    return refreshDio;
  }

  Dio _createRetryDio() {
    final retryDio = Dio(BaseOptions(baseUrl: _dio.options.baseUrl));
    retryDio.httpClientAdapter = _dio.httpClientAdapter;
    return retryDio;
  }

  String? _extractRefreshTokenFromCookie(Response<dynamic> response) {
    final cookies = response.headers['set-cookie'];
    if (cookies == null) return null;
    for (final cookie in cookies) {
      if (cookie.startsWith('refresh_token=')) {
        final token = cookie.split('=')[1].split(';').first;
        return token.isNotEmpty ? token : null;
      }
    }
    return null;
  }

  Future<void> _handleAuthFailure() async {
    await tokenStorage.clearAll();
    onAuthFailure?.call();
  }
}
