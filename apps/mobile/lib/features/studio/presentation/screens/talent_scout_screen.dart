import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/router/route_names.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/discover/data/discover_models.dart';
import 'package:tapr/features/discover/data/discover_repository.dart';
import 'package:tapr/features/studio/data/studio_repository.dart';
import 'package:tapr/shared/widgets/level_badge.dart';

class TalentScoutScreen extends ConsumerStatefulWidget {
  const TalentScoutScreen({super.key});

  @override
  ConsumerState<TalentScoutScreen> createState() => _TalentScoutScreenState();
}

class _TalentScoutScreenState extends ConsumerState<TalentScoutScreen> {
  double _minLevel = 1;
  double _maxLevel = 6;
  double _radiusKm = 10;
  List<NearbyBarber> _barbers = [];
  bool _isLoading = false;
  String? _error;
  bool _hasSearched = false;

  Future<void> _search() async {
    final profile = await ref.read(studioRepositoryProvider).fetchMyProfile();
    if (profile.lat == null || profile.lng == null) {
      setState(() {
        _error = 'Set your location in Profile to search for barbers nearby.';
        _hasSearched = true;
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
      _hasSearched = true;
    });

    try {
      final barbers = await ref.read(discoverRepositoryProvider).fetchNearbyBarbers(
            lat: profile.lat!,
            lng: profile.lng!,
            radiusKm: _radiusKm,
            minLevel: _minLevel.round(),
            maxLevel: _maxLevel.round(),
          );
      if (!mounted) return;
      setState(() {
        _barbers = barbers;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Talent Scout', style: AppTextStyles.h2),
      ),
      body: Column(
        children: [
          _buildFilterBar(),
          Expanded(
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.gold),
                  )
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _error!,
                                style: AppTextStyles.bodySecondary,
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 16),
                              if (_error!.contains('location'))
                                TextButton(
                                  onPressed: () => context.goNamed(RouteNames.studioProfile),
                                  child: const Text(
                                    'Go to Profile',
                                    style: TextStyle(color: AppColors.gold),
                                  ),
                                )
                              else
                                TextButton(
                                  onPressed: _search,
                                  child: const Text(
                                    'Retry',
                                    style: TextStyle(color: AppColors.gold),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      )
                    : !_hasSearched
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.person_search_rounded,
                                  size: 64,
                                  color: AppColors.textSecondary.withValues(alpha: 0.5),
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  'Adjust filters and tap Search',
                                  style: AppTextStyles.bodySecondary,
                                ),
                              ],
                            ),
                          )
                        : _barbers.isEmpty
                            ? Center(
                                child: Text(
                                  'No barbers found',
                                  style: AppTextStyles.bodySecondary,
                                ),
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.all(20),
                                itemCount: _barbers.length,
                                itemBuilder: (context, index) {
                                  return _BarberCard(
                                    barber: _barbers[index],
                                    onInvite: () {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text('Coming Soon — connect your Instagram in Profile settings'),
                                          behavior: SnackBarBehavior.floating,
                                        ),
                                      );
                                    },
                                  );
                                },
                              ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: AppColors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Level: ${_minLevel.round()} – ${_maxLevel.round()}', style: AppTextStyles.caption),
          Row(
            children: [
              Expanded(
                child: Slider(
                  value: _minLevel,
                  min: 1,
                  max: 6,
                  divisions: 5,
                  activeColor: AppColors.gold,
                  onChanged: (v) => setState(() => _minLevel = v.clamp(1, _maxLevel)),
                ),
              ),
              Expanded(
                child: Slider(
                  value: _maxLevel,
                  min: 1,
                  max: 6,
                  divisions: 5,
                  activeColor: AppColors.gold,
                  onChanged: (v) => setState(() => _maxLevel = v.clamp(_minLevel, 6)),
                ),
              ),
            ],
          ),
          Text('Distance: ${_radiusKm.round()} km', style: AppTextStyles.caption),
          Slider(
            value: _radiusKm,
            min: 1,
            max: 50,
            divisions: 49,
            activeColor: AppColors.gold,
            onChanged: (v) => setState(() => _radiusKm = v),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _search,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.gold,
                foregroundColor: AppColors.background,
              ),
              child: const Text('Search'),
            ),
          ),
        ],
      ),
    );
  }
}

class _BarberCard extends StatelessWidget {
  const _BarberCard({
    required this.barber,
    required this.onInvite,
  });

  final NearbyBarber barber;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () => context.push('/barbers/${barber.id}'),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: AppColors.gold.withValues(alpha: 0.2),
                  backgroundImage: barber.avatarUrl != null
                      ? NetworkImage(barber.avatarUrl!)
                      : null,
                  child: barber.avatarUrl == null
                      ? Text(
                          barber.fullName.isNotEmpty
                              ? barber.fullName[0].toUpperCase()
                              : '?',
                          style: AppTextStyles.h2.copyWith(color: AppColors.gold),
                        )
                      : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(barber.fullName, style: AppTextStyles.h3),
                      const SizedBox(height: 4),
                      LevelBadge(level: barber.level, title: barber.title),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.star_rounded, size: 14, color: AppColors.gold),
                          const SizedBox(width: 4),
                          Text(
                            barber.averageRating > 0
                                ? '${barber.averageRating.toStringAsFixed(1)} (${barber.totalRatings})'
                                : 'New',
                            style: AppTextStyles.caption,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            '${barber.totalVerifiedCuts} cuts',
                            style: AppTextStyles.caption,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            '${barber.distanceKm.toStringAsFixed(1)} km',
                            style: AppTextStyles.caption,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: onInvite,
                  child: const Text('Invite to Shift', style: TextStyle(color: AppColors.gold)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
