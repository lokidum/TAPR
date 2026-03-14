import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/barber/data/barber_dashboard_models.dart';
import 'package:tapr/features/barber/presentation/barber_dashboard_controller.dart';
import 'package:tapr/features/barber/presentation/widgets/level_up_celebration.dart';
import 'package:tapr/shared/widgets/level_badge.dart';
import 'package:tapr/shared/widgets/notification_bell.dart';

class BarberHomeScreen extends ConsumerStatefulWidget {
  const BarberHomeScreen({super.key});

  @override
  ConsumerState<BarberHomeScreen> createState() => _BarberHomeScreenState();
}

class _BarberHomeScreenState extends ConsumerState<BarberHomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(barberDashboardControllerProvider.notifier).loadDashboard();
    });
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(barberDashboardControllerProvider);

    return Stack(
      children: [
        Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            actions: const [NotificationBell()],
          ),
          body: state.isLoading && state.stats == null
              ? const Center(
                  child: CircularProgressIndicator(color: AppColors.gold),
                )
              : state.error != null && state.stats == null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(state.error!, style: AppTextStyles.bodySecondary),
                          const SizedBox(height: 16),
                          TextButton(
                            onPressed: () => ref
                                .read(barberDashboardControllerProvider.notifier)
                                .refresh(),
                            child: Text('Retry',
                                style: AppTextStyles.body
                                    .copyWith(color: AppColors.gold)),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      color: AppColors.gold,
                      onRefresh: () => ref
                          .read(barberDashboardControllerProvider.notifier)
                          .refresh(),
                      child: _DashboardContent(
                        stats: state.stats,
                        upcomingBookings: state.upcomingBookings,
                        isTogglingOnCall: state.isTogglingOnCall,
                        greeting: _greeting(),
                        error: state.error,
                        onToggleOnCall: (value) => ref
                            .read(barberDashboardControllerProvider.notifier)
                            .toggleOnCall(value),
                      ),
                    ),
        ),
        if (state.showLevelUpCelebration && state.stats != null)
          LevelUpCelebration(
            level: state.stats!.level,
            title: state.stats!.title,
            onDismiss: () => ref
                .read(barberDashboardControllerProvider.notifier)
                .acknowledgeLevelUp(),
          ),
      ],
    );
  }
}

class _DashboardContent extends StatelessWidget {
  const _DashboardContent({
    required this.stats,
    required this.upcomingBookings,
    required this.isTogglingOnCall,
    required this.greeting,
    this.error,
    required this.onToggleOnCall,
  });

  final BarberDashboardStats? stats;
  final List<UpcomingBookingCard> upcomingBookings;
  final bool isTogglingOnCall;
  final String greeting;
  final String? error;
  final ValueChanged<bool> onToggleOnCall;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.fromLTRB(
        24,
        MediaQuery.of(context).padding.top + 16,
        24,
        24,
      ),
      children: [
        _GreetingSection(
          greeting: greeting,
          name: stats?.firstName ?? 'Barber',
        ),
        const SizedBox(height: 24),
        if (stats != null) ...[
          _LevelCard(stats: stats!),
          const SizedBox(height: 24),
          _StatsRow(stats: stats!),
          const SizedBox(height: 24),
          _OnCallSection(
            isOnCall: stats!.isOnCall,
            isToggling: isTogglingOnCall,
            onToggle: onToggleOnCall,
          ),
          const SizedBox(height: 24),
        ],
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              error!,
              style: AppTextStyles.caption.copyWith(color: AppColors.error),
            ),
          ),
        _UpcomingSection(bookings: upcomingBookings),
      ],
    );
  }
}

class _GreetingSection extends StatelessWidget {
  const _GreetingSection({required this.greeting, required this.name});

  final String greeting;
  final String name;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$greeting,',
          style: AppTextStyles.bodySecondary,
        ),
        Text(name, style: AppTextStyles.h1),
      ],
    );
  }
}

class _LevelCard extends StatelessWidget {
  const _LevelCard({required this.stats});

  final BarberDashboardStats stats;

  static const _levelThresholds = <int, ({int cuts, double rating})>{
    2: (cuts: 50, rating: 4.0),
    3: (cuts: 250, rating: 4.5),
    4: (cuts: 1000, rating: 4.8),
    5: (cuts: 1000, rating: 4.8),
    6: (cuts: 1000, rating: 4.9),
  };

  @override
  Widget build(BuildContext context) {
    final nextLevel = stats.level + 1;
    final threshold = _levelThresholds[nextLevel];

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.gold.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              LevelBadge(level: stats.level, title: stats.title),
              const Spacer(),
              if (threshold != null)
                Text(
                  'Next: Lv.$nextLevel',
                  style: AppTextStyles.caption,
                ),
            ],
          ),
          if (threshold != null && nextLevel <= 4) ...[
            const SizedBox(height: 16),
            _ProgressRow(
              label: 'Verified Cuts',
              current: stats.totalCuts,
              target: threshold.cuts,
            ),
            const SizedBox(height: 12),
            _ProgressRow(
              label: 'Avg Rating',
              current: stats.averageRating,
              target: threshold.rating,
              isRating: true,
            ),
          ] else if (nextLevel == 5) ...[
            const SizedBox(height: 16),
            Text(
              'Certification required for next level',
              style: AppTextStyles.caption,
            ),
          ] else if (stats.level >= 5 && nextLevel == 6) ...[
            const SizedBox(height: 16),
            Text(
              'Admin nomination required for Master',
              style: AppTextStyles.caption,
            ),
          ] else if (stats.level >= 6) ...[
            const SizedBox(height: 12),
            Text(
              'Maximum level achieved',
              style: AppTextStyles.caption.copyWith(color: AppColors.gold),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProgressRow extends StatelessWidget {
  const _ProgressRow({
    required this.label,
    required this.current,
    required this.target,
    this.isRating = false,
  });

  final String label;
  final num current;
  final num target;
  final bool isRating;

  @override
  Widget build(BuildContext context) {
    final progress = target > 0 ? (current / target).clamp(0.0, 1.0) : 0.0;
    final currentText = isRating
        ? current.toStringAsFixed(1)
        : current.toString();
    final targetText = isRating
        ? target.toStringAsFixed(1)
        : target.toString();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: AppTextStyles.caption),
            Text(
              '$currentText / $targetText',
              style: AppTextStyles.caption.copyWith(color: AppColors.white),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: progress.toDouble(),
            minHeight: 6,
            backgroundColor: AppColors.divider,
            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.gold),
          ),
        ),
      ],
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats});

  final BarberDashboardStats stats;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _StatCard(
            label: "Today's Bookings",
            value: stats.todayCount.toString(),
            icon: Icons.calendar_today_rounded,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(
            label: "Week's Earnings",
            value: stats.formattedEarnings,
            icon: Icons.attach_money_rounded,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(
            label: 'Verified Cuts',
            value: stats.totalCuts.toString(),
            icon: Icons.content_cut_rounded,
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(icon, color: AppColors.gold, size: 22),
          const SizedBox(height: 8),
          Text(
            value,
            style: AppTextStyles.h3.copyWith(color: AppColors.gold),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AppTextStyles.caption.copyWith(fontSize: 11),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _OnCallSection extends StatelessWidget {
  const _OnCallSection({
    required this.isOnCall,
    required this.isToggling,
    required this.onToggle,
  });

  final bool isOnCall;
  final bool isToggling;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: isOnCall
            ? Border.all(color: AppColors.gold.withValues(alpha: 0.4))
            : null,
      ),
      child: Row(
        children: [
          if (isOnCall)
            Container(
              width: 10,
              height: 10,
              margin: const EdgeInsets.only(right: 12),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.gold,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.gold.withValues(alpha: 0.5),
                    blurRadius: 8,
                    spreadRadius: 2,
                  ),
                ],
              ),
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'On-Call',
                  style: AppTextStyles.h3,
                ),
                const SizedBox(height: 2),
                Text(
                  isOnCall
                      ? "You're live — clients can see you"
                      : 'Go live so nearby clients can find you',
                  style: AppTextStyles.caption,
                ),
              ],
            ),
          ),
          if (isToggling)
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.gold,
              ),
            )
          else
            Switch.adaptive(
              value: isOnCall,
              onChanged: onToggle,
              activeThumbColor: AppColors.gold,
              activeTrackColor: AppColors.gold.withValues(alpha: 0.3),
              inactiveThumbColor: AppColors.textSecondary,
              inactiveTrackColor: AppColors.divider,
            ),
        ],
      ),
    );
  }
}

class _UpcomingSection extends StatelessWidget {
  const _UpcomingSection({required this.bookings});

  final List<UpcomingBookingCard> bookings;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Upcoming Bookings', style: AppTextStyles.h2),
        const SizedBox(height: 16),
        if (bookings.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.calendar_month_outlined,
                  color: AppColors.textSecondary,
                  size: 40,
                ),
                const SizedBox(height: 12),
                Text(
                  'No upcoming bookings',
                  style: AppTextStyles.bodySecondary,
                ),
              ],
            ),
          )
        else
          SizedBox(
            height: 140,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: bookings.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                return _BookingCard(booking: bookings[index]);
              },
            ),
          ),
      ],
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({required this.booking});

  final UpcomingBookingCard booking;

  @override
  Widget build(BuildContext context) {
    final timeStr = DateFormat('h:mm a').format(booking.scheduledAt.toLocal());
    final dateStr = DateFormat('EEE, MMM d').format(booking.scheduledAt.toLocal());

    return GestureDetector(
      onTap: () => context.push('/bookings/${booking.id}'),
      child: Container(
        width: 200,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.divider,
                  backgroundImage: booking.consumerAvatarUrl != null
                      ? CachedNetworkImageProvider(booking.consumerAvatarUrl!)
                      : null,
                  child: booking.consumerAvatarUrl == null
                      ? const Icon(Icons.person, size: 18, color: AppColors.textSecondary)
                      : null,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    booking.consumerName?.split(' ').first ?? 'Client',
                    style: AppTextStyles.body.copyWith(fontSize: 14),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const Spacer(),
            Text(
              timeStr,
              style: AppTextStyles.h3.copyWith(color: AppColors.gold),
            ),
            const SizedBox(height: 2),
            Text(
              '$dateStr  ·  ${booking.displayServiceType}',
              style: AppTextStyles.caption.copyWith(fontSize: 11),
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              booking.formattedPrice,
              style: AppTextStyles.body.copyWith(fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}
