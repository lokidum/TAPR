class AppException implements Exception {
  const AppException({
    required this.message,
    this.statusCode,
    this.code,
  });

  final String message;
  final int? statusCode;
  final String? code;

  String get displayMessage {
    if (message.isNotEmpty) return message;
    return _fallbackMessage;
  }

  String get _fallbackMessage {
    if (statusCode == null) return 'An unexpected error occurred. Please try again.';
    return switch (statusCode!) {
      400 => 'Invalid request. Please check your input.',
      401 => 'Session expired. Please sign in again.',
      403 => 'You don\'t have permission to do this.',
      404 => 'The requested resource was not found.',
      409 => 'A conflict occurred. Please try again.',
      422 => 'The data provided is invalid.',
      429 => 'Too many requests. Please wait a moment.',
      >= 500 => 'Something went wrong on our end. Please try again later.',
      _ => 'An unexpected error occurred. Please try again.',
    };
  }

  factory AppException.fromResponse(int? statusCode, dynamic data) {
    if (data case {'error': {'message': final String msg}}) {
      return AppException(
        message: msg,
        statusCode: statusCode,
        code: data['error']['code'] as String?,
      );
    }

    if (data case {'error': {'message': final String msg, 'code': final String code}}) {
      return AppException(message: msg, statusCode: statusCode, code: code);
    }

    return AppException(
      message: '',
      statusCode: statusCode,
    );
  }

  static const timeout = AppException(
    message: 'Connection timed out. Please check your internet.',
  );

  static const noConnection = AppException(
    message: 'No internet connection. Please check your network.',
  );

  static const unknown = AppException(
    message: 'An unexpected error occurred. Please try again.',
  );

  @override
  String toString() => 'AppException($code: $displayMessage)';
}
