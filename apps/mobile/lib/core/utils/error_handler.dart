import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/network/api_exception.dart';
import 'package:tapr/features/auth/auth_notifier.dart';

/// Returns a user-friendly message for the given exception.
String getUserMessage(dynamic error) {
  if (error is AppException) {
    if (error.message.toLowerCase().contains('internet') ||
        error.message.toLowerCase().contains('connection')) {
      return 'No internet connection. Please check your network.';
    }
    if (error.code != null) {
      final codeMessage = _codeMessages[error.code!];
      if (codeMessage != null) return codeMessage;
    }
    return error.displayMessage;
  }
  return 'An unexpected error occurred. Please try again.';
}

const _codeMessages = <String, String>{
  'NOT_FOUND': 'The requested resource was not found.',
  'UNAUTHORIZED': 'Session expired. Please sign in again.',
  'FORBIDDEN': 'You don\'t have permission to do this.',
  'UNPROCESSABLE': 'The data provided is invalid.',
  'CONFLICT': 'A conflict occurred. Please try again.',
  'RATE_LIMITED': 'Too many requests. Please wait a moment.',
};

/// Clears tokens and triggers router redirect to welcome screen.
/// Call when user explicitly taps "Sign in again" on a 401 error.
Future<void> handle401Fallback(WidgetRef ref) async {
  final auth = ref.read(authNotifierProvider.notifier);
  await auth.setUnauthenticated();
  if (ref.context.mounted) {
    ref.context.go('/auth/welcome');
  }
}
