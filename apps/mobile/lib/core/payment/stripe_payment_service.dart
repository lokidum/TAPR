import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:tapr/core/theme/app_colors.dart';

/// Abstraction over Stripe payment sheet for testability.
abstract class StripePaymentService {
  Future<void> initPaymentSheet({
    required String clientSecret,
  });

  Future<void> presentPaymentSheet();
}

class StripePaymentServiceImpl implements StripePaymentService {
  @override
  Future<void> initPaymentSheet({
    required String clientSecret,
  }) async {
    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        paymentIntentClientSecret: clientSecret,
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
  }

  @override
  Future<void> presentPaymentSheet() async {
    await Stripe.instance.presentPaymentSheet();
  }
}

final stripePaymentServiceProvider = Provider<StripePaymentService>(
  (ref) => StripePaymentServiceImpl(),
);
