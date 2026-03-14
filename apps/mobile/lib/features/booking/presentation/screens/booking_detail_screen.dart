import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/auth/auth_notifier.dart';
import 'package:tapr/features/booking/data/booking_detail_models.dart';
import 'package:tapr/features/booking/data/booking_detail_repository.dart';
import 'package:tapr/shared/widgets/app_button.dart';

class BookingDetailScreen extends ConsumerStatefulWidget {
  const BookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<BookingDetailScreen> createState() =>
      _BookingDetailScreenState();
}

class _BookingDetailScreenState extends ConsumerState<BookingDetailScreen> {
  BookingDetail? _booking;
  bool _loading = true;
  String? _error;
  int _cutRating = 0;
  int _experienceRating = 0;
  final _reviewController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadBooking();
  }

  @override
  void dispose() {
    _reviewController.dispose();
    super.dispose();
  }

  Future<void> _loadBooking() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = ref.read(bookingDetailRepositoryProvider);
      final booking = await repo.fetchBooking(widget.bookingId);
      if (mounted) {
        setState(() {
          _booking = booking;
          _loading = false;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _booking == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
      );
    }

    if (_error != null && _booking == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, style: AppTextStyles.bodySecondary),
              const SizedBox(height: 16),
              TextButton(
                onPressed: _loadBooking,
                child: const Text('Retry', style: TextStyle(color: AppColors.gold)),
              ),
            ],
          ),
        ),
      );
    }

    final booking = _booking!;
    final role = ref.watch(authNotifierProvider).role ?? '';
    final showReviewSection = booking.status == 'completed' &&
        booking.reviewedAt == null &&
        role == 'consumer';
    final showDisputeButton =
        booking.status == 'completed' && booking.canRaiseDispute;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Booking', style: AppTextStyles.h2),
      ),
      body: RefreshIndicator(
        color: AppColors.gold,
        onRefresh: _loadBooking,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _StatusBadge(status: booking.status),
              const SizedBox(height: 20),
              _BookingInfoCard(booking: booking),
              if (showReviewSection) ...[
                const SizedBox(height: 24),
                _ReviewSection(
                  cutRating: _cutRating,
                  experienceRating: _experienceRating,
                  reviewController: _reviewController,
                  onCutRatingChanged: (v) => setState(() => _cutRating = v),
                  onExperienceRatingChanged: (v) =>
                      setState(() => _experienceRating = v),
                  onSubmit: _submitReview,
                ),
              ],
              if (showDisputeButton) ...[
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () => _showDisputeBottomSheet(booking),
                  child: Text(
                    'Raise Dispute',
                    style: AppTextStyles.body.copyWith(color: AppColors.error),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submitReview() async {
    if (_cutRating < 1 || _experienceRating < 1) return;
    try {
      await ref.read(bookingDetailRepositoryProvider).submitReview(
            widget.bookingId,
            cutRating: _cutRating,
            experienceRating: _experienceRating,
            reviewText: _reviewController.text.trim().isEmpty
                ? null
                : _reviewController.text.trim(),
          );
      if (mounted) _loadBooking();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to submit review: $e')),
        );
      }
    }
  }

  Future<void> _showDisputeBottomSheet(BookingDetail booking) async {
    final reasonController = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Raise Dispute',
              style: AppTextStyles.h3,
            ),
            const SizedBox(height: 8),
            Text(
              'Please describe the issue (min 20 characters)',
              style: AppTextStyles.caption,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'Describe what went wrong...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            AppButton(
              label: 'Submit Dispute',
              onPressed: () async {
                final reason = reasonController.text.trim();
                if (reason.length < 20) {
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    const SnackBar(
                      content: Text('Reason must be at least 20 characters'),
                    ),
                  );
                  return;
                }
                Navigator.pop(ctx);
                try {
                  await ref
                      .read(bookingDetailRepositoryProvider)
                      .raiseDispute(widget.bookingId, reason: reason);
                  if (mounted) _loadBooking();
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to raise dispute: $e')),
                    );
                  }
                }
              },
            ),
          ],
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
      case 'pending':
        return Colors.amber;
      case 'confirmed':
        return Colors.blue;
      case 'completed':
        return AppColors.success;
      case 'cancelled':
        return AppColors.textSecondary;
      case 'disputed':
        return AppColors.error;
      case 'in_progress':
        return Colors.orange;
      default:
        return AppColors.gold;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status.replaceAll('_', ' ').toUpperCase(),
        style: AppTextStyles.caption.copyWith(
          color: _color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _BookingInfoCard extends StatelessWidget {
  const _BookingInfoCard({required this.booking});

  final BookingDetail booking;

  @override
  Widget build(BuildContext context) {
    final dateStr =
        DateFormat('EEE, MMM d').format(booking.scheduledAt.toLocal());
    final timeStr =
        DateFormat('h:mm a').format(booking.scheduledAt.toLocal());

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            booking.displayServiceType,
            style: AppTextStyles.h3,
          ),
          const SizedBox(height: 8),
          Text(
            '$dateStr at $timeStr',
            style: AppTextStyles.body,
          ),
          Text(
            booking.formattedDuration,
            style: AppTextStyles.caption,
          ),
          const SizedBox(height: 12),
          const Divider(color: AppColors.divider),
          const SizedBox(height: 12),
          _InfoRow(label: 'Price', value: booking.formattedPrice),
          _InfoRow(
            label: 'Platform fee',
            value: _formatCents(booking.platformFeeCents),
          ),
          _InfoRow(
            label: 'Barber payout',
            value: _formatCents(booking.barberPayoutCents),
          ),
        ],
      ),
    );
  }

  String _formatCents(int cents) {
    final dollars = cents ~/ 100;
    final c = cents % 100;
    return '\$${dollars.toString()}.${c.toString().padLeft(2, '0')}';
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTextStyles.caption),
          Text(value, style: AppTextStyles.body),
        ],
      ),
    );
  }
}

class _ReviewSection extends StatelessWidget {
  const _ReviewSection({
    required this.cutRating,
    required this.experienceRating,
    required this.reviewController,
    required this.onCutRatingChanged,
    required this.onExperienceRatingChanged,
    required this.onSubmit,
  });

  final int cutRating;
  final int experienceRating;
  final TextEditingController reviewController;
  final ValueChanged<int> onCutRatingChanged;
  final ValueChanged<int> onExperienceRatingChanged;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Leave a review', style: AppTextStyles.h3),
          const SizedBox(height: 16),
          Text('The Cut', style: AppTextStyles.body),
          const SizedBox(height: 8),
          _StarRow(
            value: cutRating,
            onChanged: onCutRatingChanged,
          ),
          const SizedBox(height: 16),
          Text('The Experience', style: AppTextStyles.body),
          const SizedBox(height: 8),
          _StarRow(
            value: experienceRating,
            onChanged: onExperienceRatingChanged,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: reviewController,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Optional: Add a written review',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          AppButton(
            label: 'Submit Review',
            onPressed: onSubmit,
          ),
        ],
      ),
    );
  }
}

class _StarRow extends StatelessWidget {
  const _StarRow({
    required this.value,
    required this.onChanged,
  });

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(5, (i) {
        final star = i + 1;
        return GestureDetector(
          onTap: () => onChanged(star),
          child: Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Icon(
              star <= value ? Icons.star : Icons.star_border,
              color: AppColors.gold,
              size: 32,
            ),
          ),
        );
      }),
    );
  }
}
