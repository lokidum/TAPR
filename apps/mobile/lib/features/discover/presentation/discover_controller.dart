import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:tapr/features/discover/data/discover_models.dart';
import 'package:tapr/features/discover/data/discover_repository.dart';

class DiscoverState {
  const DiscoverState({
    this.feedItems = const [],
    this.feedPage = 1,
    this.isLoadingFeed = false,
    this.hasMoreFeed = true,
    this.nearbyBarbers = const [],
    this.isLoadingMap = false,
    this.likedItemIds = const {},
    this.currentLat,
    this.currentLng,
    this.error,
  });

  final List<FeedItem> feedItems;
  final int feedPage;
  final bool isLoadingFeed;
  final bool hasMoreFeed;
  final List<NearbyBarber> nearbyBarbers;
  final bool isLoadingMap;
  final Set<String> likedItemIds;
  final double? currentLat;
  final double? currentLng;
  final String? error;

  DiscoverState copyWith({
    List<FeedItem>? feedItems,
    int? feedPage,
    bool? isLoadingFeed,
    bool? hasMoreFeed,
    List<NearbyBarber>? nearbyBarbers,
    bool? isLoadingMap,
    Set<String>? likedItemIds,
    double? currentLat,
    double? currentLng,
    String? error,
    bool clearError = false,
  }) {
    return DiscoverState(
      feedItems: feedItems ?? this.feedItems,
      feedPage: feedPage ?? this.feedPage,
      isLoadingFeed: isLoadingFeed ?? this.isLoadingFeed,
      hasMoreFeed: hasMoreFeed ?? this.hasMoreFeed,
      nearbyBarbers: nearbyBarbers ?? this.nearbyBarbers,
      isLoadingMap: isLoadingMap ?? this.isLoadingMap,
      likedItemIds: likedItemIds ?? this.likedItemIds,
      currentLat: currentLat ?? this.currentLat,
      currentLng: currentLng ?? this.currentLng,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class DiscoverController extends StateNotifier<DiscoverState> {
  DiscoverController(this._repository) : super(const DiscoverState());

  final DiscoverRepository _repository;

  Future<void> init() async {
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        state = state.copyWith(
          error: 'Location permission is required to discover barbers nearby.',
        );
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
      );

      state = state.copyWith(
        currentLat: position.latitude,
        currentLng: position.longitude,
        clearError: true,
      );

      await Future.wait([
        _loadFeed(),
        _loadNearbyBarbers(),
      ]);
    } catch (e) {
      state = state.copyWith(error: 'Failed to get location: $e');
    }
  }

  Future<void> _loadFeed() async {
    if (state.currentLat == null || state.currentLng == null) return;

    state = state.copyWith(isLoadingFeed: true);
    try {
      final result = await _repository.fetchFeed(
        lat: state.currentLat!,
        lng: state.currentLng!,
        page: state.feedPage,
      );

      state = state.copyWith(
        feedItems: [...state.feedItems, ...result.items],
        hasMoreFeed: state.feedItems.length + result.items.length < result.total,
        isLoadingFeed: false,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(isLoadingFeed: false, error: 'Failed to load feed');
    }
  }

  Future<void> loadMoreFeed() async {
    if (state.isLoadingFeed || !state.hasMoreFeed) return;

    state = state.copyWith(feedPage: state.feedPage + 1);
    await _loadFeed();
  }

  Future<void> _loadNearbyBarbers() async {
    if (state.currentLat == null || state.currentLng == null) return;

    state = state.copyWith(isLoadingMap: true);
    try {
      final barbers = await _repository.fetchNearbyBarbers(
        lat: state.currentLat!,
        lng: state.currentLng!,
      );

      state = state.copyWith(
        nearbyBarbers: barbers,
        isLoadingMap: false,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(isLoadingMap: false, error: 'Failed to load map');
    }
  }

  Future<void> refreshNearbyBarbers() async {
    await _loadNearbyBarbers();
  }

  Future<void> toggleLike(FeedItem item) async {
    final isLiked = state.likedItemIds.contains(item.id);
    final newLikedIds = Set<String>.from(state.likedItemIds);
    final oldItems = List<FeedItem>.from(state.feedItems);

    if (isLiked) {
      newLikedIds.remove(item.id);
    } else {
      newLikedIds.add(item.id);
    }

    final updatedItems = state.feedItems.map((fi) {
      if (fi.id == item.id) {
        return fi.copyWith(
          likeCount: fi.likeCount + (isLiked ? -1 : 1),
        );
      }
      return fi;
    }).toList();

    state = state.copyWith(feedItems: updatedItems, likedItemIds: newLikedIds);

    try {
      final newCount = isLiked
          ? await _repository.unlikeItem(item.barber.id, item.id)
          : await _repository.likeItem(item.barber.id, item.id);

      final serverItems = state.feedItems.map((fi) {
        if (fi.id == item.id) {
          return fi.copyWith(likeCount: newCount);
        }
        return fi;
      }).toList();
      state = state.copyWith(feedItems: serverItems);
    } catch (_) {
      state = state.copyWith(feedItems: oldItems, likedItemIds: Set<String>.from(
        isLiked ? {...state.likedItemIds, item.id} : (Set<String>.from(state.likedItemIds)..remove(item.id)),
      ));
    }
  }
}

final discoverControllerProvider =
    StateNotifierProvider<DiscoverController, DiscoverState>((ref) {
  return DiscoverController(ref.read(discoverRepositoryProvider));
});
