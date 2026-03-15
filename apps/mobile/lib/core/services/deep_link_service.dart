import 'package:app_links/app_links.dart';

/// Resolves a deep link URI to an app route path.
/// Returns null if the URI is not a supported deep link.
String? resolveDeepLinkPath(Uri uri, {String? userRole}) {
  final host = uri.host;
  String? path;

  if (uri.scheme == 'https' && (host == 'tapr.app' || host == 'www.tapr.app')) {
    path = uri.path;
  } else if (uri.scheme == 'tapr') {
    path = uri.path;
  }

  if (path == null) return null;
  final normalized = path.startsWith('/') ? path : '/$path';
  if (normalized == '/') return null;
  return _resolvePathSegments(normalized, userRole);
}

String? _resolvePathSegments(String path, String? userRole) {
  final segments = path.split('/').where((s) => s.isNotEmpty).toList();
  if (segments.isEmpty) return null;

  switch (segments[0]) {
    case 'barbers':
      if (segments.length >= 2) return '/barbers/${segments[1]}';
      break;
    case 'bookings':
      if (segments.length >= 2) {
        final id = segments[1];
        return switch (userRole) {
          'barber' => '/barber/bookings/$id',
          'consumer' => '/bookings/$id',
          'studio' => '/studio/dashboard', // Studio has no booking detail
          _ => '/bookings/$id', // Default to consumer
        };
      }
      break;
    case 'events':
      if (segments.length >= 2) return '/events/${segments[1]}';
      break;
    case 'chairs':
      if (segments.length >= 2) return '/barber/marketplace?chairId=${segments[1]}';
      break;
  }

  return null;
}

/// Singleton for listening to deep links.
final appLinks = AppLinks();
