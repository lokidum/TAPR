import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:tapr/features/events/data/event_models.dart';
import 'package:tapr/features/events/data/event_repository.dart';

class EventsState {
  const EventsState({
    this.events = const [],
    this.isLoading = false,
    this.error,
    this.userLat,
    this.userLng,
    this.selectedType,
    this.isMapView = true,
    this.page = 1,
    this.totalPages = 1,
    this.total = 0,
    this.attendingIds = const {},
  });

  final List<EventListItem> events;
  final bool isLoading;
  final String? error;
  final double? userLat;
  final double? userLng;
  final EventType? selectedType;
  final bool isMapView;
  final int page;
  final int totalPages;
  final int total;
  final Set<String> attendingIds;

  EventsState copyWith({
    List<EventListItem>? events,
    bool? isLoading,
    String? error,
    double? userLat,
    double? userLng,
    EventType? selectedType,
    bool? isMapView,
    int? page,
    int? totalPages,
    int? total,
    Set<String>? attendingIds,
    bool clearError = false,
  }) {
    return EventsState(
      events: events ?? this.events,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
      userLat: userLat ?? this.userLat,
      userLng: userLng ?? this.userLng,
      selectedType: selectedType ?? this.selectedType,
      isMapView: isMapView ?? this.isMapView,
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
      total: total ?? this.total,
      attendingIds: attendingIds ?? this.attendingIds,
    );
  }
}

class EventsController extends StateNotifier<EventsState> {
  EventsController(this._repo) : super(const EventsState());

  final EventRepository _repo;

  Future<void> loadEvents({bool refresh = false, bool loadMore = false}) async {
    final page = loadMore ? state.page + 1 : (refresh ? 1 : state.page);
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      page: page,
    );

    try {
      double? lat = state.userLat;
      double? lng = state.userLng;

      if (state.isMapView && (lat == null || lng == null)) {
        final permission = await Geolocator.checkPermission();
        if (permission == LocationPermission.denied) {
          await Geolocator.requestPermission();
        }
        if (permission != LocationPermission.denied &&
            permission != LocationPermission.deniedForever) {
          final position = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.medium,
          );
          lat = position.latitude;
          lng = position.longitude;
        }
      }

      final result = await _repo.fetchEvents(
        lat: lat,
        lng: lng,
        type: state.selectedType,
        page: page,
      );

      final events = loadMore
          ? [...state.events, ...result.events]
          : result.events;

      state = state.copyWith(
        events: events,
        isLoading: false,
        userLat: lat ?? state.userLat,
        userLng: lng ?? state.userLng,
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
        page: loadMore ? state.page - 1 : state.page,
      );
    }
  }

  void setMapView(bool isMapView) {
    state = state.copyWith(isMapView: isMapView);
    loadEvents(refresh: true);
  }

  void setTypeFilter(EventType? type) {
    state = state.copyWith(selectedType: type);
    loadEvents(refresh: true);
  }

  Future<void> refresh() => loadEvents(refresh: true);

  Future<void> loadMore() async {
    if (state.page >= state.totalPages || state.isLoading) return;
    await loadEvents(loadMore: true);
  }

  Future<void> attendEvent(String eventId) async {
    await _repo.attendEvent(eventId);
    state = state.copyWith(
      attendingIds: {...state.attendingIds, eventId},
    );
  }

  Future<void> unattendEvent(String eventId) async {
    await _repo.unattendEvent(eventId);
    state = state.copyWith(
      attendingIds: {...state.attendingIds}..remove(eventId),
    );
  }

  bool isAttending(String eventId) => state.attendingIds.contains(eventId);
}

final eventsControllerProvider = StateNotifierProvider.autoDispose<
    EventsController, EventsState>((ref) {
  final repo = ref.read(eventRepositoryProvider);
  return EventsController(repo);
});
