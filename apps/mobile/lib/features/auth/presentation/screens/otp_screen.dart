import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/auth/presentation/auth_controller.dart';

class OTPScreen extends ConsumerStatefulWidget {
  const OTPScreen({super.key, required this.phone});

  final String phone;

  @override
  ConsumerState<OTPScreen> createState() => _OTPScreenState();
}

class _OTPScreenState extends ConsumerState<OTPScreen>
    with SingleTickerProviderStateMixin {
  static const _codeLength = 6;
  static const _resendSeconds = 60;

  final _controllers = List.generate(
    _codeLength,
    (_) => TextEditingController(),
  );
  final _focusNodes = List.generate(_codeLength, (_) => FocusNode());

  late final AnimationController _shakeController;
  late final Animation<double> _shakeAnimation;

  Timer? _timer;
  int _secondsRemaining = _resendSeconds;
  bool _isSubmitting = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();

    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _shakeAnimation = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0, end: -10), weight: 1),
      TweenSequenceItem(tween: Tween(begin: -10, end: 10), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 10, end: -10), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -10, end: 6), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 6, end: -3), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -3, end: 0), weight: 1),
    ]).animate(CurvedAnimation(
      parent: _shakeController,
      curve: Curves.easeOut,
    ));

    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _shakeController.dispose();
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  void _startTimer() {
    _secondsRemaining = _resendSeconds;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _secondsRemaining--;
        if (_secondsRemaining <= 0) {
          timer.cancel();
        }
      });
    });
  }

  String get _code => _controllers.map((c) => c.text).join();

  Future<void> _submit() async {
    if (_isSubmitting) return;
    final code = _code;
    if (code.length != _codeLength) return;

    setState(() {
      _isSubmitting = true;
      _errorText = null;
    });

    final success = await ref
        .read(authControllerProvider.notifier)
        .verifyOtp(widget.phone, code);

    if (!mounted) return;

    if (success) {
      context.go('/auth/onboarding');
    } else {
      final authState = ref.read(authControllerProvider);
      setState(() {
        _isSubmitting = false;
        _errorText = authState.error;
      });
      _shakeController.forward(from: 0);
      _clearInputs();
    }
  }

  void _clearInputs() {
    for (final c in _controllers) {
      c.clear();
    }
    _focusNodes[0].requestFocus();
  }

  void _onDigitChanged(int index, String value) {
    if (value.length > 1) {
      _controllers[index].text = value[value.length - 1];
      _controllers[index].selection = TextSelection.fromPosition(
        const TextPosition(offset: 1),
      );
    }

    if (value.isNotEmpty && index < _codeLength - 1) {
      _focusNodes[index + 1].requestFocus();
    }

    if (_code.length == _codeLength) {
      _submit();
    }
  }

  void _onKeyEvent(int index, KeyEvent event) {
    if (event is KeyDownEvent &&
        event.logicalKey == LogicalKeyboardKey.backspace &&
        _controllers[index].text.isEmpty &&
        index > 0) {
      _controllers[index - 1].clear();
      _focusNodes[index - 1].requestFocus();
    }
  }

  Future<void> _resendCode() async {
    setState(() => _errorText = null);
    final success = await ref
        .read(authControllerProvider.notifier)
        .requestOtp(widget.phone);
    if (success && mounted) {
      _startTimer();
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = _isSubmitting || authState.isLoading;

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
              Text('Check your phone', style: AppTextStyles.h2),
              const SizedBox(height: 8),
              Text(
                'We sent a code to ${widget.phone}',
                style: AppTextStyles.bodySecondary,
              ),
              const SizedBox(height: 40),
              AnimatedBuilder(
                animation: _shakeAnimation,
                builder: (context, child) {
                  return Transform.translate(
                    offset: Offset(_shakeAnimation.value, 0),
                    child: child,
                  );
                },
                child: _PinRow(
                  controllers: _controllers,
                  focusNodes: _focusNodes,
                  enabled: !isLoading,
                  hasError: _errorText != null,
                  onChanged: _onDigitChanged,
                  onKeyEvent: _onKeyEvent,
                ),
              ),
              if (_errorText != null) ...[
                const SizedBox(height: 12),
                Text(
                  _errorText!,
                  style: AppTextStyles.caption.copyWith(color: AppColors.error),
                ),
              ],
              const SizedBox(height: 24),
              if (isLoading)
                const Center(
                  child: SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(AppColors.gold),
                    ),
                  ),
                )
              else
                Center(
                  child: _secondsRemaining > 0
                      ? Text(
                          'Resend in 0:${_secondsRemaining.toString().padLeft(2, '0')}',
                          style: AppTextStyles.bodySecondary,
                        )
                      : TextButton(
                          onPressed: _resendCode,
                          child: Text(
                            'Resend Code',
                            style: AppTextStyles.body
                                .copyWith(color: AppColors.gold),
                          ),
                        ),
                ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}

class _PinRow extends StatelessWidget {
  const _PinRow({
    required this.controllers,
    required this.focusNodes,
    required this.enabled,
    required this.hasError,
    required this.onChanged,
    required this.onKeyEvent,
  });

  final List<TextEditingController> controllers;
  final List<FocusNode> focusNodes;
  final bool enabled;
  final bool hasError;
  final void Function(int index, String value) onChanged;
  final void Function(int index, KeyEvent event) onKeyEvent;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(controllers.length, (i) {
        return Padding(
          padding: EdgeInsets.only(left: i > 0 ? 10 : 0),
          child: _PinDigit(
            controller: controllers[i],
            focusNode: focusNodes[i],
            enabled: enabled,
            hasError: hasError,
            onChanged: (v) => onChanged(i, v),
            onKeyEvent: (e) => onKeyEvent(i, e),
            autofocus: i == 0,
          ),
        );
      }),
    );
  }
}

class _PinDigit extends StatelessWidget {
  const _PinDigit({
    required this.controller,
    required this.focusNode,
    required this.enabled,
    required this.hasError,
    required this.onChanged,
    required this.onKeyEvent,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool enabled;
  final bool hasError;
  final ValueChanged<String> onChanged;
  final void Function(KeyEvent) onKeyEvent;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final borderColor = hasError ? AppColors.error : AppColors.divider;

    return SizedBox(
      width: 48,
      height: 56,
      child: KeyboardListener(
        focusNode: FocusNode(),
        onKeyEvent: onKeyEvent,
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          enabled: enabled,
          autofocus: autofocus,
          textAlign: TextAlign.center,
          keyboardType: TextInputType.number,
          maxLength: 1,
          onChanged: onChanged,
          style: AppTextStyles.h2,
          cursorColor: AppColors.gold,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(
            counterText: '',
            filled: true,
            fillColor: AppColors.surface,
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: borderColor),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.gold, width: 2),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: borderColor),
            ),
          ),
        ),
      ),
    );
  }
}
