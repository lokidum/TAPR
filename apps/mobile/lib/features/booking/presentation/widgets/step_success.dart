import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/booking/presentation/booking_controller.dart';
import 'package:tapr/shared/widgets/app_button.dart';

class StepSuccess extends StatefulWidget {
  const StepSuccess({
    super.key,
    required this.state,
    required this.onViewBooking,
  });

  final BookingState state;
  final VoidCallback onViewBooking;

  @override
  State<StepSuccess> createState() => _StepSuccessState();
}

class _StepSuccessState extends State<StepSuccess>
    with TickerProviderStateMixin {
  late final AnimationController _checkController;
  late final AnimationController _contentController;
  late final Animation<double> _checkScale;
  late final Animation<double> _checkOpacity;
  late final Animation<double> _contentSlide;
  late final Animation<double> _contentOpacity;

  @override
  void initState() {
    super.initState();

    _checkController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _contentController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _checkScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.2), weight: 60),
      TweenSequenceItem(tween: Tween(begin: 1.2, end: 1.0), weight: 40),
    ]).animate(CurvedAnimation(
      parent: _checkController,
      curve: Curves.easeOut,
    ));

    _checkOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _checkController,
        curve: const Interval(0.0, 0.4),
      ),
    );

    _contentSlide = Tween<double>(begin: 30.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _contentController,
        curve: Curves.easeOut,
      ),
    );

    _contentOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _contentController,
        curve: Curves.easeOut,
      ),
    );

    _checkController.forward().then((_) {
      _contentController.forward();
    });
  }

  @override
  void dispose() {
    _checkController.dispose();
    _contentController.dispose();
    super.dispose();
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
    final state = widget.state;
    final date = state.selectedDate;
    final time = state.selectedTime;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    const SizedBox(height: 40),
                    AnimatedBuilder(
                      animation: _checkController,
                      builder: (context, child) {
                        return Opacity(
                          opacity: _checkOpacity.value,
                          child: Transform.scale(
                            scale: _checkScale.value,
                            child: child,
                          ),
                        );
                      },
                      child: Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: [
                              AppColors.gold,
                              AppColors.gold.withValues(alpha: 0.7),
                            ],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.gold.withValues(alpha: 0.3),
                              blurRadius: 30,
                              spreadRadius: 5,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          color: AppColors.white,
                          size: 56,
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),
                    AnimatedBuilder(
                      animation: _contentController,
                      builder: (context, child) {
                        return Opacity(
                          opacity: _contentOpacity.value,
                          child: Transform.translate(
                            offset: Offset(0, _contentSlide.value),
                            child: child,
                          ),
                        );
                      },
                      child: Column(
                        children: [
                          Text(
                            'Your booking is confirmed!',
                            style: AppTextStyles.h1,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'You\'ll receive a notification when the barber confirms.',
                            style: AppTextStyles.bodySecondary,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 32),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: AppColors.gold.withValues(alpha: 0.3),
                              ),
                            ),
                            child: Column(
                              children: [
                                _DetailRow(
                                  label: 'Service',
                                  value: state.selectedService?.name ?? '',
                                ),
                                const SizedBox(height: 12),
                                _DetailRow(
                                  label: 'Type',
                                  value: state.selectedServiceType ?? '',
                                ),
                                const SizedBox(height: 12),
                                _DetailRow(
                                  label: 'Date',
                                  value: date != null
                                      ? DateFormat('EEE, MMM d').format(date)
                                      : '',
                                ),
                                const SizedBox(height: 12),
                                _DetailRow(
                                  label: 'Time',
                                  value: time != null ? _formatTime(time) : '',
                                ),
                                const SizedBox(height: 12),
                                _DetailRow(
                                  label: 'Total paid',
                                  value: _formatCents(state.totalCents),
                                  valueColor: AppColors.gold,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
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
              child: AppButton(
                label: 'View Booking',
                onPressed: widget.onViewBooking,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatCents(int cents) {
    final dollars = cents ~/ 100;
    final remainder = cents % 100;
    return '\$${dollars.toString()}.${remainder.toString().padLeft(2, '0')}';
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: AppTextStyles.bodySecondary),
        Text(
          value,
          style: AppTextStyles.body.copyWith(
            color: valueColor ?? AppColors.white,
            fontWeight: valueColor != null ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ],
    );
  }
}
