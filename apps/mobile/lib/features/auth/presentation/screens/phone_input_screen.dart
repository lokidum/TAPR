import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/auth/presentation/auth_controller.dart';
import 'package:tapr/features/auth/utils/phone_validation.dart';
import 'package:tapr/shared/utils/snackbar_utils.dart';
import 'package:tapr/shared/widgets/app_button.dart';

class PhoneInputScreen extends ConsumerStatefulWidget {
  const PhoneInputScreen({super.key});

  @override
  ConsumerState<PhoneInputScreen> createState() => _PhoneInputScreenState();
}

class _PhoneInputScreenState extends ConsumerState<PhoneInputScreen> {
  final _phoneController = TextEditingController();
  final _focusNode = FocusNode();

  @override
  void dispose() {
    _phoneController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _onSendCode() async {
    final raw = _phoneController.text.trim();
    if (raw.isEmpty) {
      showErrorSnackBar(context, 'Please enter your phone number.');
      return;
    }
    if (!isValidAustralianPhone(raw)) {
      showErrorSnackBar(context, 'Please enter a valid Australian phone number.');
      return;
    }

    var phone = raw.replaceAll(RegExp(r'[\s\-]'), '');
    if (phone.startsWith('0')) phone = phone.substring(1);
    final fullPhone = '+61$phone';
    final success =
        await ref.read(authControllerProvider.notifier).requestOtp(fullPhone);

    if (success && mounted) {
      context.push('/auth/otp', extra: fullPhone);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);

    ref.listen<AuthScreenState>(authControllerProvider, (prev, next) {
      if (next.error != null && prev?.error != next.error) {
        showErrorSnackBar(context, next.error!);
        ref.read(authControllerProvider.notifier).clearError();
      }
    });

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 16),
              Text('Enter your number', style: AppTextStyles.h2),
              const SizedBox(height: 8),
              Text(
                'We\'ll send you a verification code.',
                style: AppTextStyles.bodySecondary,
              ),
              const SizedBox(height: 32),
              _PhoneField(
                controller: _phoneController,
                focusNode: _focusNode,
                enabled: !authState.isLoading,
                onSubmitted: (_) => _onSendCode(),
              ),
              const SizedBox(height: 32),
              AppButton(
                label: 'Send Code',
                onPressed: authState.isLoading ? null : _onSendCode,
                isLoading: authState.isLoading,
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}

class _PhoneField extends StatelessWidget {
  const _PhoneField({
    required this.controller,
    required this.focusNode,
    required this.enabled,
    required this.onSubmitted,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool enabled;
  final ValueChanged<String> onSubmitted;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 52,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🇦🇺', style: TextStyle(fontSize: 18)),
              const SizedBox(width: 6),
              Text('+61', style: AppTextStyles.body),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: SizedBox(
            height: 52,
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              enabled: enabled,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.send,
              autofocus: true,
              onSubmitted: onSubmitted,
              style: AppTextStyles.body,
              cursorColor: AppColors.gold,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(10),
              ],
              decoration: const InputDecoration(
                hintText: '412 345 678',
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
