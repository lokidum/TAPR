import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/events/data/event_models.dart';
import 'package:tapr/features/events/presentation/events_controller.dart';

class EventsScreen extends ConsumerStatefulWidget {
  const EventsScreen({super.key});

  @override
  ConsumerState<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends ConsumerState<EventsScreen> {
  bool _isMapView = true;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(eventsControllerProvider.notifier).loadEvents(refresh: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(eventsControllerProvider);
    final controller = ref.read(eventsControllerProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Events', style: AppTextStyles.h2),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(96),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              children: [
                _TypeFilterBar(
                  selectedType: state.selectedType,
                  onTypeSelected: controller.setTypeFilter,
                ),
                const SizedBox(height: 8),
                _ViewToggle(
                  isMapView: _isMapView,
                  onChanged: (v) {
                    setState(() => _isMapView = v);
                    controller.setMapView(v);
                  },
                ),
              ],
            ),
          ),
        ),
      ),
      body: state.isLoading && state.events.isEmpty
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.gold),
            )
          : state.error != null && state.events.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        state.error!,
                        style: AppTextStyles.bodySecondary,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () => controller.refresh(),
                        child: const Text(
                          'Retry',
                          style: TextStyle(color: AppColors.gold),
                        ),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: controller.refresh,
                  color: AppColors.gold,
                  child: _isMapView
                      ? _EventsMapView(state: state, controller: controller)
                      : _EventsListView(state: state, controller: controller),
                ),
    );
  }
}

class _TypeFilterBar extends StatelessWidget {
  const _TypeFilterBar({
    required this.selectedType,
    required this.onTypeSelected,
  });

  final EventType? selectedType;
  final ValueChanged<EventType?> onTypeSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _FilterChip(
            label: 'All',
            isSelected: selectedType == null,
            onTap: () => onTypeSelected(null),
          ),
          const SizedBox(width: 8),
          ...EventType.values.map(
            (t) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _FilterChip(
                label: t.label,
                isSelected: selectedType == t,
                onTap: () => onTypeSelected(t),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.gold : AppColors.surface,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: AppTextStyles.caption.copyWith(
            color: isSelected ? AppColors.background : AppColors.textSecondary,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ),
    );
  }
}

class _ViewToggle extends StatelessWidget {
  const _ViewToggle({
    required this.isMapView,
    required this.onChanged,
  });

  final bool isMapView;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(true),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: isMapView ? AppColors.gold : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Map',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body.copyWith(
                    color: isMapView
                        ? AppColors.background
                        : AppColors.textSecondary,
                    fontWeight: isMapView ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(false),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: !isMapView ? AppColors.gold : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'List',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body.copyWith(
                    color: !isMapView
                        ? AppColors.background
                        : AppColors.textSecondary,
                    fontWeight:
                        !isMapView ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EventsMapView extends ConsumerWidget {
  const _EventsMapView({
    required this.state,
    required this.controller,
  });

  final EventsState state;
  final EventsController controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lat = state.userLat ?? -33.87;
    final lng = state.userLng ?? 151.2;
    final eventsWithCoords =
        state.events.where((e) => e.lat != null && e.lng != null).toList();

    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(
            target: LatLng(lat, lng),
            zoom: 12,
          ),
          onMapCreated: (mapController) {
            if (eventsWithCoords.isNotEmpty) {
              final bounds = _computeBounds(eventsWithCoords);
              mapController.animateCamera(
                CameraUpdate.newLatLngBounds(bounds, 48),
              );
            }
          },
          markers: eventsWithCoords
              .map(
                (e) => Marker(
                  markerId: MarkerId(e.id),
                  position: LatLng(e.lat!, e.lng!),
                  onTap: () => context.push('/events/${e.id}'),
                ),
              )
              .toSet(),
          myLocationEnabled: true,
          myLocationButtonEnabled: true,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
          style: _darkMapStyle,
        ),
        if (state.events.isEmpty)
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.event_rounded,
                  size: 48,
                  color: AppColors.textSecondary.withValues(alpha: 0.5),
                ),
                const SizedBox(height: 8),
                Text(
                  'No events nearby',
                  style: AppTextStyles.bodySecondary,
                ),
              ],
            ),
          ),
      ],
    );
  }

  LatLngBounds _computeBounds(List<EventListItem> events) {
    double minLat = events.first.lat!;
    double maxLat = events.first.lat!;
    double minLng = events.first.lng!;
    double maxLng = events.first.lng!;
    for (final e in events) {
      if (e.lat! < minLat) minLat = e.lat!;
      if (e.lat! > maxLat) maxLat = e.lat!;
      if (e.lng! < minLng) minLng = e.lng!;
      if (e.lng! > maxLng) maxLng = e.lng!;
    }
    return LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
  }
}

const _darkMapStyle = '''
[
  {"elementType":"geometry","stylers":[{"color":"#242f3e"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#746855"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#242f3e"}]},
  {"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#263c3f"}]},
  {"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#6b9a76"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#38414e"}]},
  {"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#212a37"}]},
  {"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#9ca5b3"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#746855"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#1f2835"}]},
  {"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#f3d19c"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#2f3948"}]},
  {"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#17263c"}]},
  {"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#515c6d"}]},
  {"featureType":"water","elementType":"labels.text.stroke","stylers":[{"color":"#17263c"}]}
]
''';

class _EventsListView extends ConsumerWidget {
  const _EventsListView({
    required this.state,
    required this.controller,
  });

  final EventsState state;
  final EventsController controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.events.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.event_rounded,
              size: 48,
              color: AppColors.textSecondary.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 8),
            Text(
              'No events found',
              style: AppTextStyles.bodySecondary,
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: state.events.length + (state.page < state.totalPages ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == state.events.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: TextButton(
                onPressed: state.isLoading
                    ? null
                    : () => controller.loadMore(),
                child: state.isLoading
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          color: AppColors.gold,
                          strokeWidth: 2,
                        ),
                      )
                    : const Text(
                        'Load More',
                        style: TextStyle(color: AppColors.gold),
                      ),
              ),
            ),
          );
        }
        final event = state.events[index];
        return _EventCard(
          event: event,
          isAttending: controller.isAttending(event.id),
          onTap: () => context.push('/events/${event.id}'),
          onInterestedTap: () async {
            if (controller.isAttending(event.id)) {
              await controller.unattendEvent(event.id);
            } else {
              await controller.attendEvent(event.id);
            }
          },
        );
      },
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({
    required this.event,
    required this.isAttending,
    required this.onTap,
    required this.onInterestedTap,
  });

  final EventListItem event;
  final bool isAttending;
  final VoidCallback onTap;
  final VoidCallback onInterestedTap;

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('EEE, MMM d');
    final timeFormat = DateFormat('h:mm a');

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 140,
              width: double.infinity,
              child: event.coverImageUrl != null
                  ? CachedNetworkImage(
                      imageUrl: event.coverImageUrl!,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => _CoverPlaceholder(
                        eventType: event.eventType,
                      ),
                      errorWidget: (_, __, ___) => _CoverPlaceholder(
                        eventType: event.eventType,
                      ),
                    )
                  : _CoverPlaceholder(eventType: event.eventType),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.gold.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          event.eventType.label,
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.gold,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: onInterestedTap,
                        child: Icon(
                          isAttending
                              ? Icons.star_rounded
                              : Icons.star_outline_rounded,
                          color: isAttending ? AppColors.gold : AppColors.textSecondary,
                          size: 28,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    event.title,
                    style: AppTextStyles.h3,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(
                        Icons.calendar_today_rounded,
                        size: 14,
                        color: AppColors.textSecondary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '${dateFormat.format(event.startsAt)} · ${timeFormat.format(event.startsAt)}',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                  if (event.locationAddress != null &&
                      event.locationAddress!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on_outlined,
                          size: 14,
                          color: AppColors.textSecondary,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            event.locationAddress!,
                            style: AppTextStyles.caption,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text(
                        event.formattedPrice,
                        style: AppTextStyles.body.copyWith(
                          color: AppColors.gold,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 16),
                      const Icon(
                        Icons.people_outline_rounded,
                        size: 14,
                        color: AppColors.textSecondary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Attendees',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder({required this.eventType});

  final EventType eventType;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.gold.withValues(alpha: 0.4),
            AppColors.goldMuted.withValues(alpha: 0.3),
          ],
        ),
      ),
      child: Center(
        child: Icon(
          _eventTypeIcon,
          size: 48,
          color: AppColors.gold.withValues(alpha: 0.8),
        ),
      ),
    );
  }

  IconData get _eventTypeIcon {
    return switch (eventType) {
      EventType.workshop => Icons.school_rounded,
      EventType.liveActivation => Icons.campaign_rounded,
      EventType.popUp => Icons.storefront_rounded,
      EventType.guestSpot => Icons.person_rounded,
    };
  }
}
