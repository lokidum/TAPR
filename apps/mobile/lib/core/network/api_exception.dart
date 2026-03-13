class ApiException implements Exception {
  const ApiException({
    required this.message,
    this.statusCode,
    this.code,
  });

  final String message;
  final int? statusCode;
  final String? code;

  factory ApiException.fromDioError(dynamic error) {
    if (error.response?.data case {'error': {'message': final String msg}}) {
      return ApiException(
        message: msg,
        statusCode: error.response?.statusCode as int?,
        code: error.response?.data['error']['code'] as String?,
      );
    }

    return ApiException(
      message: _mapStatusCode(error.response?.statusCode as int?),
      statusCode: error.response?.statusCode as int?,
    );
  }

  static String _mapStatusCode(int? code) {
    if (code == null) return 'An unexpected error occurred. Please try again.';
    return switch (code) {
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

  @override
  String toString() => message;
}
