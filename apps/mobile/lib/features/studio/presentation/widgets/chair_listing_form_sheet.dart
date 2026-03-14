import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/network/api_exception.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/studio/data/studio_chairs_repository.dart';
import 'package:tapr/features/studio/data/studio_models.dart';
import 'package:tapr/shared/widgets/app_button.dart';

class ChairListingFormSheet extends ConsumerStatefulWidget {
  const ChairListingFormSheet({
    super.key,
    this.existing,
    required this.onSuccess,
  });

  final StudioChairListing? existing;
  final VoidCallback onSuccess;

  @override
  ConsumerState<ChairListingFormSheet> createState() =>
      _ChairListingFormSheetState();
}

class _ChairListingFormSheetState extends ConsumerState<ChairListingFormSheet> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _pricePerDayController = TextEditingController();
  final _pricePerWeekController = TextEditingController();
  final _sickCallPremiumController = TextEditingController(text: '0');

  DateTime? _availableFrom;
  DateTime? _availableTo;
  String _listingType = 'daily';
  int _minLevelRequired = 1;
  bool _isSickCall = false;
  bool _isSubmitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _titleController.text = e.title;
      _descriptionController.text = e.description ?? '';
      _pricePerDayController.text = (e.priceCentsPerDay / 100).toStringAsFixed(2);
      _pricePerWeekController.text = e.priceCentsPerWeek != null
          ? (e.priceCentsPerWeek! / 100).toStringAsFixed(2)
          : '';
      _availableFrom = e.availableFrom;
      _availableTo = e.availableTo;
      _listingType = e.listingType;
      _minLevelRequired = e.minLevelRequired;
      _isSickCall = e.isSickCall;
      _sickCallPremiumController.text = '${e.sickCallPremiumPct}';
    } else {
      final now = DateTime.now();
      _availableFrom = now;
      _availableTo = now.add(const Duration(days: 30));
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _pricePerDayController.dispose();
    _pricePerWeekController.dispose();
    _sickCallPremiumController.dispose();
    super.dispose();
  }

  int? _parseCents(String dollarText) {
    final v = double.tryParse(dollarText.replaceAll(RegExp(r'[^\d.]'), ''));
    if (v == null || v < 0) return null;
    return (v * 100).round();
  }

  Future<void> _pickDateRange() async {
    final firstDate = widget.existing != null
        ? widget.existing!.availableFrom
        : DateTime.now();
    final lastDate = widget.existing != null
        ? widget.existing!.availableTo
        : DateTime.now().add(const Duration(days: 365));

    final range = await showDateRangePicker(
      context: context,
      firstDate: firstDate,
      lastDate: lastDate,
      initialDateRange: DateTimeRange(
        start: _availableFrom ?? firstDate,
        end: _availableTo ?? firstDate.add(const Duration(days: 30)),
      ),
      builder: (context, child) {
        return Theme(
          data: ThemeData.dark().copyWith(
            colorScheme: const ColorScheme.dark(
              primary: AppColors.gold,
              surface: AppColors.surface,
            ),
          ),
          child: child!,
        );
      },
    );
    if (!mounted || range == null) return;
    setState(() {
      _availableFrom = range.start;
      _availableTo = range.end;
    });
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Title is required');
      return;
    }

    final priceCentsPerDay = _parseCents(_pricePerDayController.text);
    if (priceCentsPerDay == null || priceCentsPerDay < 1000) {
      setState(() => _error = 'Price per day must be at least \$10');
      return;
    }

    int? priceCentsPerWeek;
    if (_pricePerWeekController.text.trim().isNotEmpty) {
      priceCentsPerWeek = _parseCents(_pricePerWeekController.text);
      if (priceCentsPerWeek == null || priceCentsPerWeek < 1000) {
        setState(() => _error = 'Price per week must be at least \$10');
        return;
      }
    }

    if (_availableFrom == null || _availableTo == null) {
      setState(() => _error = 'Select availability dates');
      return;
    }
    if (_availableTo!.isBefore(_availableFrom!) ||
        _availableTo!.isAtSameMomentAs(_availableFrom!)) {
      setState(() => _error = 'End date must be after start date');
      return;
    }

    final sickCallPremiumPct =
        int.tryParse(_sickCallPremiumController.text) ?? 0;
    if (_isSickCall && (sickCallPremiumPct < 0 || sickCallPremiumPct > 100)) {
      setState(() => _error = 'Sick call premium must be 0–100%');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      final repo = ref.read(studioChairsRepositoryProvider);

      if (widget.existing != null) {
        await repo.updateChair(
          widget.existing!.id,
          title: title,
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
          priceCentsPerDay: priceCentsPerDay,
          priceCentsPerWeek: priceCentsPerWeek,
          availableFrom: _availableFrom,
          availableTo: _availableTo,
          minLevelRequired: _minLevelRequired,
          isSickCall: _isSickCall,
          sickCallPremiumPct: sickCallPremiumPct,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Listing updated'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
          ),
        );
        widget.onSuccess();
        Navigator.pop(context);
        return;
      }

      final intentResult = await repo.fetchListingFeeIntent();
      if (!mounted) return;

      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: intentResult.clientSecret,
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
            shapes: PaymentSheetShape(borderRadius: 12),
          ),
        ),
      );

      await Stripe.instance.presentPaymentSheet();

      if (!mounted) return;

      await repo.createChair(
        title: title,
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
        priceCentsPerDay: priceCentsPerDay,
        priceCentsPerWeek: priceCentsPerWeek,
        availableFrom: _availableFrom!,
        availableTo: _availableTo!,
        listingType: _listingType,
        minLevelRequired: _minLevelRequired,
        isSickCall: _isSickCall,
        sickCallPremiumPct: sickCallPremiumPct,
        paymentIntentId: intentResult.paymentIntentId,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Chair listed successfully'),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
        ),
      );
      widget.onSuccess();
      Navigator.pop(context);
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = e.error is AppException
          ? (e.error as AppException).message
          : e.message ?? 'Failed';
      setState(() {
        _isSubmitting = false;
        _error = msg;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } on StripeException catch (e) {
      if (!mounted) return;
      String message;
      switch (e.error.code) {
        case FailureCode.Canceled:
          message = 'Payment cancelled';
          break;
        case FailureCode.Failed:
          message = 'Payment failed. Please check your card details.';
          break;
        case FailureCode.Timeout:
          message = 'Payment timed out.';
          break;
        default:
          message = e.error.localizedMessage ?? 'Payment failed.';
      }
      setState(() {
        _isSubmitting = false;
        _error = message;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.all(20),
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                widget.existing != null ? 'Edit Chair' : 'List a Chair',
                style: AppTextStyles.h2,
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _titleController,
                decoration: const InputDecoration(
                  labelText: 'Title',
                  border: OutlineInputBorder(),
                ),
                style: const TextStyle(color: AppColors.white),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description (optional)',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
                style: const TextStyle(color: AppColors.white),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _pricePerDayController,
                      decoration: const InputDecoration(
                        labelText: 'Price/day (\$)',
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: const TextStyle(color: AppColors.white),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _pricePerWeekController,
                      decoration: const InputDecoration(
                        labelText: 'Price/week (\$)',
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: const TextStyle(color: AppColors.white),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              InkWell(
                onTap: _pickDateRange,
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.divider),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_today_rounded, color: AppColors.gold),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _availableFrom != null && _availableTo != null
                              ? '${DateFormat.yMMMd().format(_availableFrom!)} – ${DateFormat.yMMMd().format(_availableTo!)}'
                              : 'Select dates',
                          style: AppTextStyles.body,
                        ),
                      ),
                      const Icon(Icons.chevron_right, color: AppColors.textSecondary),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Listing type', style: AppTextStyles.caption),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: ['daily', 'weekly', 'sick_call', 'permanent']
                    .map((t) => ChoiceChip(
                          label: Text(_listingTypeLabel(t)),
                          selected: _listingType == t,
                          onSelected: (_) => setState(() => _listingType = t),
                          selectedColor: AppColors.gold.withValues(alpha: 0.3),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 16),
              Text('Min level: $_minLevelRequired', style: AppTextStyles.caption),
              Slider(
                value: _minLevelRequired.toDouble(),
                min: 1,
                max: 6,
                divisions: 5,
                activeColor: AppColors.gold,
                onChanged: (v) => setState(() => _minLevelRequired = v.round()),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Text('Sick call', style: AppTextStyles.body),
                  const Spacer(),
                  Switch.adaptive(
                    value: _isSickCall,
                    onChanged: (v) => setState(() => _isSickCall = v),
                    activeThumbColor: AppColors.gold,
                    activeTrackColor: AppColors.gold.withValues(alpha: 0.3),
                  ),
                ],
              ),
              if (_isSickCall) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _sickCallPremiumController,
                  decoration: const InputDecoration(
                    labelText: 'Premium %',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: AppColors.white),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!, style: AppTextStyles.bodySecondary.copyWith(color: AppColors.error)),
              ],
              const SizedBox(height: 24),
              AppButton(
                label: widget.existing != null ? 'Save' : 'List Chair (\$5 fee)',
                onPressed: _isSubmitting ? null : _submit,
                isLoading: _isSubmitting,
              ),
              SizedBox(height: MediaQuery.of(context).padding.bottom + 20),
            ],
          ),
        );
      },
    );
  }

  String _listingTypeLabel(String t) {
    switch (t) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'sick_call':
        return 'Sick Call';
      case 'permanent':
        return 'Permanent';
      default:
        return t;
    }
  }
}
