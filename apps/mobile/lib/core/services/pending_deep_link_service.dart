import 'package:flutter_riverpod/flutter_riverpod.dart';

class PendingDeepLinkNotifier extends StateNotifier<String?> {
  PendingDeepLinkNotifier() : super(null);

  void store(String path) {
    state = path;
  }

  String? take() {
    final path = state;
    state = null;
    return path;
  }
}

final pendingDeepLinkProvider =
    StateNotifierProvider<PendingDeepLinkNotifier, String?>((ref) {
  return PendingDeepLinkNotifier();
});
