import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/router/route_names.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/studio/data/studio_models.dart';
import 'package:tapr/features/studio/data/studio_repository.dart';
import 'package:intl/intl.dart';

class StudioDashboardScreen extends ConsumerStatefulWidget {
  const StudioDashboardScreen({super.key});

  @override
  ConsumerState<StudioDashboardScreen> createState() =>
      _StudioDashboardScreenState();
}

class _StudioDashboardScreenState extends ConsumerState<StudioDashboardScreen> {
  StudioProfile? _profile;
  StudioStats? _stats;
  List<StudioRentalSummary> _rentals = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final repo = ref.read(studioRepositoryProvider);
      final results = await Future.wait([
        repo.fetchMyProfile(),
        repo.fetchMyStats(),
        repo.fetchRecentRentals(),
      ]);
      if (!mounted) return;
      setState(() {
        _profile = results[0] as StudioProfile;
        _stats = results[1] as StudioStats;
        _rentals = results[2] as List<StudioRentalSummary>;
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
    if (_isLoading && _profile == null) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Studio Dashboard', style: AppTextStyles.h2),
      ),
      body: _error != null && _profile == null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!, style: AppTextStyles.bodySecondary, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: _load,
                    child: const Text('Retry', style: TextStyle(color: AppColors.gold)),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.gold,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHeader(),
                    const SizedBox(height: 24),
                    _buildStatsRow(),
                    const SizedBox(height: 24),
                    _buildQuickActions(),
                    const SizedBox(height: 24),
                    _buildRecentRentals(),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildHeader() {
    final name = _profile?.businessName ?? 'Studio';
    final isVerified = _profile?.isVerified ?? false;

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: AppTextStyles.h1),
              const SizedBox(height: 4),
              if (isVerified)
                Row(
                  children: [
                    const Icon(Icons.verified_rounded, size: 18, color: AppColors.gold),
                    const SizedBox(width: 6),
                    Text('Verified', style: AppTextStyles.caption.copyWith(color: AppColors.gold)),
                  ],
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatsRow() {
    final stats = _stats ?? const StudioStats(
        totalChairs: 0, rentalsThisMonth: 0, revenueThisMonth: 0, occupancyRate: 0);

    return Row(
      children: [
        Expanded(child: _StatCard(label: 'Chairs', value: '${stats.totalChairs}')),
        const SizedBox(width: 12),
        Expanded(child: _StatCard(label: 'Rentals', value: '${stats.rentalsThisMonth}')),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(
            label: 'Revenue',
            value: '\$${(stats.revenueThisMonth / 100).toStringAsFixed(0)}',
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(
            label: 'Occupancy',
            value: '${stats.occupancyRate.toStringAsFixed(1)}%',
          ),
        ),
      ],
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Quick Actions', style: AppTextStyles.h3),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _ActionCard(
                icon: Icons.chair_rounded,
                label: 'List a Chair',
                onTap: () => context.goNamed(RouteNames.studioChairs),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _ActionCard(
                icon: Icons.person_search_rounded,
                label: 'Scout Talent',
                onTap: () => context.goNamed(RouteNames.talentScout),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _ActionCard(
                icon: Icons.event_rounded,
                label: 'Create Event',
                onTap: () => context.goNamed(RouteNames.studioEvents),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildRecentRentals() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Recent Rentals', style: AppTextStyles.h3),
        const SizedBox(height: 12),
        if (_rentals.isEmpty)
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(
                'No rentals yet',
                style: AppTextStyles.bodySecondary,
              ),
            ),
          )
        else
          ..._rentals.map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RentalCard(rental: r),
            ),
          ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTextStyles.caption),
          const SizedBox(height: 4),
          Text(value, style: AppTextStyles.h3),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Icon(icon, color: AppColors.gold, size: 28),
              const SizedBox(height: 8),
              Text(label, style: AppTextStyles.caption, textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}

class _RentalCard extends StatelessWidget {
  const _RentalCard({required this.rental});

  final StudioRentalSummary rental;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: AppColors.gold.withValues(alpha: 0.2),
            backgroundImage: rental.barberAvatarUrl != null
                ? NetworkImage(rental.barberAvatarUrl!)
                : null,
            child: rental.barberAvatarUrl == null
                ? Text(
                    rental.barberName.isNotEmpty ? rental.barberName[0].toUpperCase() : '?',
                    style: AppTextStyles.h3.copyWith(color: AppColors.gold),
                  )
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(rental.barberName, style: AppTextStyles.body),
                Text(rental.listingTitle, style: AppTextStyles.caption),
                Text(
                  '${DateFormat.MMMd().format(rental.startAt)} – ${DateFormat.MMMd().format(rental.endAt)}',
                  style: AppTextStyles.caption,
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.gold.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              rental.statusLabel,
              style: AppTextStyles.caption.copyWith(color: AppColors.gold),
            ),
          ),
        ],
      ),
    );
  }
}
