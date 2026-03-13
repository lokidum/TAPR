import 'dart:io';

import 'package:dio/dio.dart';
import 'package:tapr/core/network/api_exception.dart';

class ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final appException = _mapToAppException(err);
    handler.reject(
      DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        error: appException,
        type: err.type,
      ),
    );
  }

  AppException _mapToAppException(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return AppException.timeout;

      case DioExceptionType.connectionError:
        return AppException.noConnection;

      case DioExceptionType.badResponse:
        if (err.response != null) {
          return AppException.fromResponse(
            err.response!.statusCode,
            err.response!.data,
          );
        }
        return AppException.unknown;

      default:
        if (err.error is SocketException) {
          return AppException.noConnection;
        }
        return AppException.unknown;
    }
  }
}
