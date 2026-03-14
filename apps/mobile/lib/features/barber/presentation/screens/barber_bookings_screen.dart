import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/barber/data/barber_dashboard_models.dart';
import 'package:tapr/features/barber/data/barber_dashboard_repository.dart';
import 'package:tapr/features/booking/data/booking_detail_models.dart';
import 'package:tapr/features/booking/data/booking_detail_repository.dart';

class BarberBookingsScreen extends ConsumerStatefulWidget {
  const BarberBookingsScreen({super.key});

  @override
  ConsumerState<BarberBookingsScreen> createState() =>
      _BarberBookingsScreenState();
}

class _BarberBookingsScreenState extends ConsumerState<BarberBookingsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<UpcomingBookingCard> _upcomingBookings = [];
  bool _upcomingLoading = true;
  String? _upcomingError;
  final PagingController<int, BookingDetail> _historyPaging =
      PagingController(firstPageKey: 1);

  static const _pageSize = 20;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadUpcoming();
    _historyPaging.addPageRequestListener(_fetchHistoryPage);
  }

  Future<void> _loadUpcoming() async {
    setState(() {
      _upcomingLoading = true;
      _upcomingError = null;
    });
    try {
      final repo = ref.read(barberDashboardRepositoryProvider);
      final bookings = await repo.fetchUpcoming();
      if (mounted) {
        setState(() {
          _upcomingBookings = bookings;
          _upcomingLoading = false;
          _upcomingError = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _upcomingLoading = false;
          _upcomingError = e.toString();
        });
      }
    }
  }

  Future<void> _fetchHistoryPage(int pageKey) async {
    try {
      final repo = ref.read(barberDashboardRepositoryProvider);
      final result = await repo.fetchHistory(page: pageKey, limit: _pageSize);
      final isLast =
          (pageKey - 1) * _pageSize + result.bookings.length >= result.total;
      if (isLast) {
        _historyPaging.appendLastPage(result.bookings);
      } else {
        _historyPaging.appendPage(result.bookings, pageKey + 1);
      }
    } catch (e) {
      _historyPaging.error = e;
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    _historyPaging.dispose();
    super.dispose();
  }

  void _navigateToDetail(String bookingId) {
    context.push('/barber/bookings/$bookingId');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Bookings', style: AppTextStyles.h2),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.gold,
          labelColor: AppColors.gold,
          unselectedLabelColor: AppColors.textSecondary,
          tabs: const [
            Tab(text: 'Upcoming'),
            Tab(text: 'History'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _UpcomingTab(
            bookings: _upcomingBookings,
            isLoading: _upcomingLoading,
            error: _upcomingError,
            onRefresh: _loadUpcoming,
            onTapCard: (b) => _navigateToDetail(b.id),
            onConfirm: _handleConfirm,
            onComplete: _handleComplete,
          ),
          _HistoryTab(
            pagingController: _historyPaging,
            onTapCard: _navigateToDetail,
          ),
        ],
      ),
    );
  }

  Future<void> _handleConfirm(UpcomingBookingCard booking) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Confirm booking'),
        content: Text(
          'Confirm this booking with ${booking.consumerName ?? 'client'}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(bookingDetailRepositoryProvider).confirmBooking(booking.id);
      if (mounted) _loadUpcoming();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to confirm: $e')),
        );
      }
    }
  }

  Future<void> _handleComplete(UpcomingBookingCard booking) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Complete booking'),
        content: const Text(
          'Mark this booking as completed?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Complete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(bookingDetailRepositoryProvider).completeBooking(booking.id);
      if (mounted) {
        _loadUpcoming();
        _historyPaging.refresh();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to complete: $e')),
        );
      }
    }
  }
}

class _UpcomingTab extends StatelessWidget {
  const _UpcomingTab({
    required this.bookings,
    required this.isLoading,
    this.error,
    required this.onRefresh,
    required this.onTapCard,
    required this.onConfirm,
    required this.onComplete,
  });

  final List<UpcomingBookingCard> bookings;
  final bool isLoading;
  final String? error;
  final Future<void> Function() onRefresh;
  final ValueChanged<UpcomingBookingCard> onTapCard;
  final ValueChanged<UpcomingBookingCard> onConfirm;
  final ValueChanged<UpcomingBookingCard> onComplete;

  @override
  Widget build(BuildContext context) {
    if (isLoading && bookings.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.gold),
      );
    }

    return RefreshIndicator(
      color: AppColors.gold,
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text(
                error!,
                style: AppTextStyles.caption.copyWith(color: AppColors.error),
              ),
            ),
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
            ...bookings.map((b) => _UpcomingCard(
                  booking: b,
                  onTap: () => onTapCard(b),
                  onConfirm: b.status == 'pending' ? () => onConfirm(b) : null,
                  onComplete: b.status == 'confirmed' &&
                          b.scheduledAt.isBefore(DateTime.now())
                      ? () => onComplete(b)
                      : null,
                )),
        ],
      ),
    );
  }
}

class _UpcomingCard extends StatelessWidget {
  const _UpcomingCard({
    required this.booking,
    required this.onTap,
    this.onConfirm,
    this.onComplete,
  });

  final UpcomingBookingCard booking;
  final VoidCallback onTap;
  final VoidCallback? onConfirm;
  final VoidCallback? onComplete;

  @override
  Widget build(BuildContext context) {
    final timeStr = DateFormat('h:mm a').format(booking.scheduledAt.toLocal());
    final dateStr =
        DateFormat('EEE, MMM d').format(booking.scheduledAt.toLocal());

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
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
                    radius: 20,
                    backgroundColor: AppColors.divider,
                    backgroundImage: booking.consumerAvatarUrl != null
                        ? CachedNetworkImageProvider(booking.consumerAvatarUrl!)
                        : null,
                    child: booking.consumerAvatarUrl == null
                        ? const Icon(Icons.person,
                            size: 24, color: AppColors.textSecondary)
                        : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          booking.consumerName ?? 'Client',
                          style: AppTextStyles.h3,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$dateStr · $timeStr',
                          style: AppTextStyles.caption,
                        ),
                        Text(
                          '${booking.displayServiceType} · ${booking.durationMinutes}min · ${booking.formattedPrice}',
                          style: AppTextStyles.caption,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (onConfirm != null || onComplete != null) ...[
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (onConfirm != null)
                      TextButton(
                        onPressed: onConfirm,
                        child: const Text('Confirm'),
                      ),
                    if (onComplete != null)
                      TextButton(
                        onPressed: onComplete,
                        child: const Text('Complete'),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({
    required this.pagingController,
    required this.onTapCard,
  });

  final PagingController<int, BookingDetail> pagingController;
  final ValueChanged<String> onTapCard;

  @override
  Widget build(BuildContext context) {
    return PagedListView<int, BookingDetail>(
      pagingController: pagingController,
      padding: const EdgeInsets.all(16),
      builderDelegate: PagedChildBuilderDelegate<BookingDetail>(
        itemBuilder: (context, booking, index) {
          final dateStr =
              DateFormat('EEE, MMM d').format(booking.scheduledAt.toLocal());
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: GestureDetector(
              onTap: () => onTapCard(booking.id),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            booking.displayServiceType,
                            style: AppTextStyles.body,
                          ),
                          Text(
                            dateStr,
                            style: AppTextStyles.caption,
                          ),
                        ],
                      ),
                    ),
                    _StatusBadge(status: booking.status),
                    const SizedBox(width: 8),
                    Text(
                      booking.formattedPrice,
                      style: AppTextStyles.body,
                    ),
                  ],
                ),
              ),
            ),
          );
        },
        firstPageProgressIndicatorBuilder: (_) => const Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
        noItemsFoundIndicatorBuilder: (_) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.history,
                  size: 48, color: AppColors.textSecondary.withValues(alpha: 0.5)),
              const SizedBox(height: 8),
              Text('No booking history', style: AppTextStyles.bodySecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  Color get _color {
    switch (status) {
      case 'completed':
        return AppColors.success;
      case 'cancelled':
        return AppColors.textSecondary;
      default:
        return AppColors.gold;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status.toUpperCase(),
        style: AppTextStyles.caption.copyWith(
          color: _color,
          fontSize: 10,
        ),
      ),
    );
  }
}
