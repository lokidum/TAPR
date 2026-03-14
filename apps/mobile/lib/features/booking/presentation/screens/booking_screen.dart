import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/booking/presentation/booking_controller.dart';
import 'package:tapr/features/booking/presentation/widgets/step_service_selection.dart';
import 'package:tapr/features/booking/presentation/widgets/step_date_time.dart';
import 'package:tapr/features/booking/presentation/widgets/step_confirmation.dart';
import 'package:tapr/features/booking/presentation/widgets/step_success.dart';

class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({super.key, required this.barberId});

  final String barberId;

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(bookingControllerProvider(widget.barberId).notifier).loadServices();
    });
  }

  Future<void> _handleConfirmAndPay() async {
    final notifier = ref.read(bookingControllerProvider(widget.barberId).notifier);

    await notifier.createBooking();

    final state = ref.read(bookingControllerProvider(widget.barberId));
    if (state.bookingResult == null) return;

    try {
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: state.bookingResult!.clientSecret,
          merchantDisplayName: 'TAPR',
          style: ThemeMode.dark,
          appearance: const PaymentSheetAppearance(
            colors: PaymentSheetAppearanceColors(
              background: AppColors.surface,
              primary: AppColors.gold,
              componentBackground: AppColors.background,
              componentText: AppColors.white,
              primaryText: AppColors.white,
              secondaryText: AppColors.textSecondary,
              icon: AppColors.gold,
            ),
            shapes: PaymentSheetShape(
              borderRadius: 12,
            ),
          ),
        ),
      );

      await Stripe.instance.presentPaymentSheet();

      notifier.nextStep();
    } on StripeException catch (e) {
      if (!mounted) return;
      final code = e.error.code;
      String message;

      switch (code) {
        case FailureCode.Canceled:
          message = 'Payment cancelled';
          break;
        case FailureCode.Failed:
          message = 'Payment failed. Please check your card details and try again.';
          break;
        case FailureCode.Timeout:
          message = 'Payment timed out. Please try again.';
          break;
        default:
          message = e.error.localizedMessage ?? 'Payment failed. Please try again.';
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(bookingControllerProvider(widget.barberId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: state.currentStep < 4
          ? AppBar(
              backgroundColor: AppColors.background,
              elevation: 0,
              leading: state.currentStep > 1
                  ? IconButton(
                      icon: const Icon(Icons.arrow_back, color: AppColors.white),
                      onPressed: () {
                        ref
                            .read(bookingControllerProvider(widget.barberId).notifier)
                            .previousStep();
                      },
                    )
                  : IconButton(
                      icon: const Icon(Icons.close, color: AppColors.white),
                      onPressed: () => context.pop(),
                    ),
              title: Text(
                _stepTitle(state.currentStep),
                style: AppTextStyles.h3,
              ),
              centerTitle: true,
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(4),
                child: _StepIndicator(currentStep: state.currentStep),
              ),
            )
          : null,
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        child: _buildStep(state),
      ),
    );
  }

  Widget _buildStep(BookingState state) {
    switch (state.currentStep) {
      case 1:
        return StepServiceSelection(
          key: const ValueKey('step1'),
          state: state,
          onServiceTypeSelected: (type) {
            ref
                .read(bookingControllerProvider(widget.barberId).notifier)
                .selectServiceType(type);
          },
          onServiceSelected: (service) {
            ref
                .read(bookingControllerProvider(widget.barberId).notifier)
                .selectService(service);
          },
          onNext: () {
            ref
                .read(bookingControllerProvider(widget.barberId).notifier)
                .nextStep();
          },
        );
      case 2:
        return StepDateTime(
          key: const ValueKey('step2'),
          state: state,
          onDateSelected: (date) {
            ref
                .read(bookingControllerProvider(widget.barberId).notifier)
                .selectDate(date);
          },
          onTimeSelected: (time) {
            ref
                .read(bookingControllerProvider(widget.barberId).notifier)
                .selectTime(time);
          },
          onNext: () {
            ref
                .read(bookingControllerProvider(widget.barberId).notifier)
                .nextStep();
          },
        );
      case 3:
        return StepConfirmation(
          key: const ValueKey('step3'),
          state: state,
          onConfirmAndPay: _handleConfirmAndPay,
        );
      case 4:
        return StepSuccess(
          key: const ValueKey('step4'),
          state: state,
          onViewBooking: () {
            final bookingId = state.bookingResult?.bookingId;
            if (bookingId != null) {
              context.go('/bookings/$bookingId');
            }
          },
        );
      default:
        return const SizedBox.shrink();
    }
  }

  String _stepTitle(int step) {
    switch (step) {
      case 1:
        return 'Select Service';
      case 2:
        return 'Pick Date & Time';
      case 3:
        return 'Confirm Booking';
      default:
        return '';
    }
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.currentStep});

  final int currentStep;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        children: List.generate(3, (index) {
          final isActive = index < currentStep;
          return Expanded(
            child: Container(
              height: 3,
              margin: EdgeInsets.only(right: index < 2 ? 4 : 0),
              decoration: BoxDecoration(
                color: isActive ? AppColors.gold : AppColors.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }),
      ),
    );
  }
}
