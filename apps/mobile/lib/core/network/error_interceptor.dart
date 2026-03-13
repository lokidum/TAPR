import 'dart:io';

import 'package:dio/dio.dart';
import 'package:tapr/core/network/api_exception.dart';

class ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout) {
      handler.reject(
        DioException(
          requestOptions: err.requestOptions,
          error: const ApiException(
            message: 'Connection timed out. Please check your internet.',
          ),
          type: err.type,
        ),
      );
      return;
    }

    if (err.error is SocketException) {
      handler.reject(
        DioException(
          requestOptions: err.requestOptions,
          error: const ApiException(
            message: 'No internet connection. Please check your network.',
          ),
          type: DioExceptionType.connectionError,
        ),
      );
      return;
    }

    if (err.response != null) {
      handler.reject(
        DioException(
          requestOptions: err.requestOptions,
          response: err.response,
          error: ApiException.fromDioError(err),
          type: err.type,
        ),
      );
      return;
    }

    handler.next(err);
  }
}
