import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/features/auth/auth_notifier.dart';
import 'package:tapr/features/events/data/event_models.dart';
import 'package:tapr/features/events/data/event_repository.dart';

final studioEventsProvider =
    FutureProvider.autoDispose<List<EventListItem>>((ref) async {
  final auth = ref.watch(authNotifierProvider);
  final userId = auth.userId;
  if (userId == null) return [];

  final repo = ref.read(eventRepositoryProvider);
  final result = await repo.fetchEvents(organizerId: userId);
  return result.events;
});
