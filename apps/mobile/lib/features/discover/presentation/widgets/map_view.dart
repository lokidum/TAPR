import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/discover/data/discover_models.dart';
import 'package:tapr/features/discover/presentation/discover_controller.dart';
import 'package:tapr/shared/widgets/app_button.dart';
import 'package:tapr/shared/widgets/level_badge.dart';

class DiscoverMapView extends ConsumerStatefulWidget {
  const DiscoverMapView({super.key});

  @override
  ConsumerState<DiscoverMapView> createState() => _DiscoverMapViewState();
}

class _DiscoverMapViewState extends ConsumerState<DiscoverMapView>
    with SingleTickerProviderStateMixin {
  final Completer<GoogleMapController> _mapController = Completer();
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
    _pulseAnimation = Tween<double>(begin: 0.3, end: 0.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Set<Marker> _buildMarkers(List<NearbyBarber> barbers) {
    return barbers.map((barber) {
      if (barber.lat == null || barber.lng == null) return null;

      return Marker(
        markerId: MarkerId(barber.id),
        position: LatLng(barber.lat!, barber.lng!),
        icon: BitmapDescriptor.defaultMarkerWithHue(43),
        onTap: () => _showBarberSheet(barber),
      );
    }).whereType<Marker>().toSet();
  }

  Set<Circle> _buildOnCallCircles(List<NearbyBarber> barbers) {
    return barbers
        .where((b) => b.isOnCall && b.lat != null && b.lng != null)
        .map((barber) {
      return Circle(
        circleId: CircleId('pulse_${barber.id}'),
        center: LatLng(barber.lat!, barber.lng!),
        radius: 80,
        fillColor: AppColors.gold.withValues(alpha: _pulseAnimation.value),
        strokeColor: AppColors.gold.withValues(alpha: _pulseAnimation.value * 2),
        strokeWidth: 1,
      );
    }).toSet();
  }

  void _showBarberSheet(NearbyBarber barber) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.divider,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: AppColors.gold,
                  child: Text(
                    barber.fullName.isNotEmpty
                        ? barber.fullName[0].toUpperCase()
                        : '?',
                    style: AppTextStyles.h2.copyWith(color: AppColors.background),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(barber.fullName, style: AppTextStyles.h3),
                      const SizedBox(height: 4),
                      LevelBadge(level: barber.level, title: barber.title),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _InfoChip(
                  icon: Icons.star_rounded,
                  label: barber.averageRating > 0
                      ? '${barber.averageRating.toStringAsFixed(1)} (${barber.totalRatings})'
                      : 'New',
                ),
                const SizedBox(width: 12),
                _InfoChip(
                  icon: Icons.location_on_rounded,
                  label: '${barber.distanceKm.toStringAsFixed(1)} km',
                ),
                if (barber.isOnCall) ...[
                  const SizedBox(width: 12),
                  const _InfoChip(
                    icon: Icons.bolt_rounded,
                    label: 'On Call',
                    color: AppColors.gold,
                  ),
                ],
              ],
            ),
            const SizedBox(height: 20),
            AppButton(
              label: 'Book',
              onPressed: () {
                Navigator.pop(context);
                context.push('/book/${barber.id}');
              },
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(discoverControllerProvider);

    if (state.isLoadingMap && state.nearbyBarbers.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.gold),
      );
    }

    if (state.currentLat == null || state.currentLng == null) {
      return Center(
        child: Text('Unable to get location', style: AppTextStyles.bodySecondary),
      );
    }

    return AnimatedBuilder(
      animation: _pulseAnimation,
      builder: (context, child) {
        return GoogleMap(
          initialCameraPosition: CameraPosition(
            target: LatLng(state.currentLat!, state.currentLng!),
            zoom: 14,
          ),
          onMapCreated: (controller) {
            if (!_mapController.isCompleted) {
              _mapController.complete(controller);
            }
          },
          markers: _buildMarkers(state.nearbyBarbers),
          circles: _buildOnCallCircles(state.nearbyBarbers),
          myLocationEnabled: true,
          myLocationButtonEnabled: true,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
          style: _darkMapStyle,
        );
      },
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({
    required this.icon,
    required this.label,
    this.color,
  });

  final IconData icon;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final chipColor = color ?? AppColors.textSecondary;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: chipColor),
        const SizedBox(width: 4),
        Text(label, style: AppTextStyles.caption.copyWith(color: chipColor)),
      ],
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
