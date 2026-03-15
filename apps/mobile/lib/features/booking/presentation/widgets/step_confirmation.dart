import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/booking/presentation/booking_controller.dart';
import 'package:tapr/shared/widgets/app_button.dart';

class StepConfirmation extends StatelessWidget {
  const StepConfirmation({
    super.key,
    required this.state,
    required this.onConfirmAndPay,
  });

  final BookingState state;
  final VoidCallback onConfirmAndPay;

  String _formatCents(int cents) {
    final dollars = cents ~/ 100;
    final remainder = cents % 100;
    return '\$${dollars.toString()}.${remainder.toString().padLeft(2, '0')}';
  }

  String _formatTime(String time) {
    final parts = time.split(':');
    final hour = int.parse(parts[0]);
    final minute = parts[1];
    final period = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour > 12 ? hour - 12 : (hour == 0 ? 12 : hour);
    return '$displayHour:$minute $period';
  }

  @override
  Widget build(BuildContext context) {
    final service = state.selectedService;
    final date = state.selectedDate;
    final time = state.selectedTime;

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Booking Summary', style: AppTextStyles.h2),
                const SizedBox(height: 24),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      _SummaryRow(
                        icon: Icons.content_cut,
                        label: 'Service',
                        value: service?.name ?? '',
                      ),
                      const _Divider(),
                      _SummaryRow(
                        icon: Icons.location_on_outlined,
                        label: 'Type',
                        value: state.selectedServiceType ?? '',
                      ),
                      const _Divider(),
                      _SummaryRow(
                        icon: Icons.calendar_today_outlined,
                        label: 'Date',
                        value: date != null
                            ? DateFormat('EEEE, MMMM d, y').format(date)
                            : '',
                      ),
                      const _Divider(),
                      _SummaryRow(
                        icon: Icons.schedule,
                        label: 'Time',
                        value: time != null ? _formatTime(time) : '',
                      ),
                      const _Divider(),
                      _SummaryRow(
                        icon: Icons.timelapse,
                        label: 'Duration',
                        value: service?.formattedDuration ?? '',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Text('Price Breakdown', style: AppTextStyles.h2),
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      _PriceRow(
                        label: 'Service fee',
                        value: _formatCents(state.servicePriceCents),
                      ),
                      const SizedBox(height: 12),
                      _PriceRow(
                        label: 'Platform fee (10%)',
                        value: _formatCents(state.platformFeeCents),
                      ),
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Divider(color: AppColors.divider, height: 1),
                      ),
                      _PriceRow(
                        label: 'Total',
                        value: _formatCents(state.totalCents),
                        isBold: true,
                      ),
                    ],
                  ),
                ),
                if (state.error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    state.error!,
                    style: AppTextStyles.caption.copyWith(color: AppColors.error),
                  ),
                ],
              ],
            ),
          ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(
            24,
            16,
            24,
            16 + MediaQuery.of(context).padding.bottom,
          ),
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(
              top: BorderSide(color: AppColors.divider),
            ),
          ),
          child: AppButton(
            label: 'Confirm & Pay ${_formatCents(state.totalCents)}',
            onPressed: (state.isCreatingBooking || state.selectedTime == null)
                ? null
                : onConfirmAndPay,
            isLoading: state.isCreatingBooking,
          ),
        ),
      ],
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.gold),
          const SizedBox(width: 12),
          Text(label, style: AppTextStyles.bodySecondary),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              style: AppTextStyles.body,
              textAlign: TextAlign.right,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.label,
    required this.value,
    this.isBold = false,
  });

  final String label;
  final String value;
  final bool isBold;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: isBold
              ? AppTextStyles.h3
              : AppTextStyles.bodySecondary,
        ),
        Text(
          value,
          style: isBold
              ? AppTextStyles.h3.copyWith(color: AppColors.gold)
              : AppTextStyles.body,
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 4),
      child: Divider(color: AppColors.divider, height: 1),
    );
  }
}
