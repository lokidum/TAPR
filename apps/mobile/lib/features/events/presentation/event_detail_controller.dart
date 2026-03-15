import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/features/events/data/event_models.dart';
import 'package:tapr/features/events/data/event_repository.dart';

final eventDetailProvider = FutureProvider.autoDispose
    .family<EventDetail, String>((ref, eventId) async {
  final repo = ref.read(eventRepositoryProvider);
  return repo.fetchEventDetail(eventId);
});

final eventAttendingProvider = StateProvider.autoDispose
    .family<bool, String>((ref, eventId) => false);
