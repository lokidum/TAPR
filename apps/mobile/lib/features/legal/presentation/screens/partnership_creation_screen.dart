import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_spacing.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/legal/data/legal_models.dart';
import 'package:tapr/features/legal/data/legal_repository.dart';
import 'package:tapr/shared/widgets/app_button.dart';
import 'package:tapr/shared/widgets/level_badge.dart';

const _platformEquityPct = 7;

class PartnershipCreationScreen extends ConsumerStatefulWidget {
  const PartnershipCreationScreen({super.key});

  @override
  ConsumerState<PartnershipCreationScreen> createState() =>
      _PartnershipCreationScreenState();
}

class _PartnershipCreationScreenState
    extends ConsumerState<PartnershipCreationScreen> {
  int _step = 0;

  // Step 1
  String _searchQuery = '';
  Timer? _debounce;
  List<PartnershipEligibleBarber> _barbers = [];
  bool _isSearching = false;
  PartnershipEligibleBarber? _selectedPartner;

  // Step 2
  final _businessNameController = TextEditingController();
  final _stateController = TextEditingController();
  PartnershipStructureType _structureType = PartnershipStructureType.unincorporatedJv;
  int _equitySplitInitiator = 46; // 46 + 47 + 7 = 100

  // Step 3
  int _vestingMonths = 48;
  int _cliffMonths = 12;

  // Step 4
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _searchBarbers('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _businessNameController.dispose();
    _stateController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _searchQuery = query;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      _searchBarbers(query);
    });
  }

  Future<void> _searchBarbers(String query) async {
    setState(() => _isSearching = true);
    try {
      final barbers = await ref.read(legalRepositoryProvider).searchPartnershipEligibleBarbers(
            q: query.isEmpty ? null : query,
            limit: 20,
          );
      if (!mounted) return;
      setState(() {
        _barbers = barbers;
        _isSearching = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSearching = false);
    }
  }

  int get _equitySplitPartner => 100 - _equitySplitInitiator - _platformEquityPct;

  Future<void> _sendForSignature() async {
    if (_selectedPartner == null) return;

    setState(() => _isSending = true);

    try {
      final repo = ref.read(legalRepositoryProvider);
      final partnership = await repo.createPartnership(
        partnerBarberId: _selectedPartner!.id,
        businessName: _businessNameController.text.trim().isEmpty
            ? null
            : _businessNameController.text.trim(),
        state: _stateController.text.trim().isEmpty
            ? null
            : _stateController.text.trim(),
        structureType: _structureType.apiValue,
        equitySplitInitiator: _equitySplitInitiator,
        equitySplitPartner: _equitySplitPartner,
        vestingMonths: _vestingMonths,
        cliffMonths: _cliffMonths,
        platformEquityPct: _platformEquityPct,
      );

      await repo.sendPartnership(partnership.id);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('DocuSign email has been sent to both parties.'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.success,
        ),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to send: $e'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(false),
        ),
        title: Text(
          _stepTitle,
          style: AppTextStyles.h2,
        ),
      ),
      body: Column(
        children: [
          _buildStepIndicator(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: _buildStepContent(),
            ),
          ),
          _buildBottomBar(),
        ],
      ),
    );
  }

  String get _stepTitle {
    return switch (_step) {
      0 => 'Step 1: Find Partner',
      1 => 'Step 2: Business Details',
      2 => 'Step 3: Terms',
      3 => 'Step 4: Review & Send',
      _ => 'Partnership',
    };
  }

  Widget _buildStepIndicator() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Row(
        children: List.generate(4, (i) {
          final isActive = i <= _step;
          return Expanded(
            child: Container(
              margin: const EdgeInsets.only(right: 4),
              height: 4,
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

  Widget _buildStepContent() {
    return switch (_step) {
      0 => _buildStep1Search(),
      1 => _buildStep2BusinessDetails(),
      2 => _buildStep3Terms(),
      3 => _buildStep4Review(),
      _ => const SizedBox.shrink(),
    };
  }

  Widget _buildStep1Search() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Search for your partner (both must be Level 5+)',
          style: AppTextStyles.bodySecondary,
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          onChanged: _onSearchChanged,
          decoration: InputDecoration(
            hintText: 'Search by name...',
            prefixIcon: const Icon(Icons.search),
            filled: true,
            fillColor: AppColors.surface,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (_isSearching)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.xl),
              child: CircularProgressIndicator(color: AppColors.gold),
            ),
          )
        else if (_barbers.isEmpty)
          Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Text(
              _searchQuery.isEmpty
                  ? 'Type to search for Level 5+ barbers'
                  : 'No barbers found',
              style: AppTextStyles.bodySecondary,
              textAlign: TextAlign.center,
            ),
          )
        else
          ..._barbers.map((b) => _PartnerBarberTile(
                barber: b,
                isSelected: _selectedPartner?.id == b.id,
                onTap: () => setState(() => _selectedPartner = b),
              )),
      ],
    );
  }

  Widget _buildStep2BusinessDetails() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _businessNameController,
          decoration: const InputDecoration(
            labelText: 'Business name (optional)',
            filled: true,
            fillColor: AppColors.surface,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          controller: _stateController,
          decoration: const InputDecoration(
            labelText: 'State (optional)',
            filled: true,
            fillColor: AppColors.surface,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text('Structure type', style: AppTextStyles.caption),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.sm,
          children: PartnershipStructureType.values.map((t) {
            final isSelected = _structureType == t;
            return ChoiceChip(
              label: Text(t.displayLabel),
              selected: isSelected,
              onSelected: (_) => setState(() => _structureType = t),
              selectedColor: AppColors.gold.withValues(alpha: 0.3),
            );
          }).toList(),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          'Equity split: You $_equitySplitInitiator% | Partner $_equitySplitPartner% | Platform $_platformEquityPct%',
          style: AppTextStyles.bodySecondary,
        ),
        Slider(
          value: _equitySplitInitiator.toDouble(),
          min: 0,
          max: (100 - _platformEquityPct).toDouble(),
          divisions: 93,
          activeColor: AppColors.gold,
          onChanged: (v) => setState(() => _equitySplitInitiator = v.round()),
        ),
      ],
    );
  }

  Widget _buildStep3Terms() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Vesting period (months)', style: AppTextStyles.caption),
        Slider(
          value: _vestingMonths.toDouble(),
          min: 1,
          max: 120,
          divisions: 119,
          activeColor: AppColors.gold,
          label: '$_vestingMonths months',
          onChanged: (v) => setState(() => _vestingMonths = v.round()),
        ),
        Text('$_vestingMonths months', style: AppTextStyles.bodySecondary),
        const SizedBox(height: AppSpacing.lg),
        Text('Cliff period (months)', style: AppTextStyles.caption),
        Slider(
          value: _cliffMonths.toDouble(),
          min: 0,
          max: 120,
          divisions: 120,
          activeColor: AppColors.gold,
          label: '$_cliffMonths months',
          onChanged: (v) => setState(() => _cliffMonths = v.round()),
        ),
        Text('$_cliffMonths months', style: AppTextStyles.bodySecondary),
        const SizedBox(height: AppSpacing.xl),
        Text('Summary', style: AppTextStyles.h3),
        const SizedBox(height: AppSpacing.sm),
        _buildSummaryCard(),
      ],
    );
  }

  Widget _buildSummaryCard() {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _summaryRow('Partner', _selectedPartner?.fullName ?? '—'),
          _summaryRow('Business', _businessNameController.text.trim().isEmpty ? '—' : _businessNameController.text.trim()),
          _summaryRow('State', _stateController.text.trim().isEmpty ? '—' : _stateController.text.trim()),
          _summaryRow('Structure', _structureType.displayLabel),
          _summaryRow('Equity', 'You $_equitySplitInitiator% | Partner $_equitySplitPartner% | Platform $_platformEquityPct%'),
          _summaryRow('Vesting', '$_vestingMonths months'),
          _summaryRow('Cliff', '$_cliffMonths months'),
        ],
      ),
    );
  }

  Widget _summaryRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: AppTextStyles.caption),
          ),
          Expanded(child: Text(value, style: AppTextStyles.body)),
        ],
      ),
    );
  }

  Widget _buildStep4Review() {
    return _buildSummaryCard();
  }

  Widget _buildBottomBar() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: [
            if (_step > 0)
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _step--),
                  child: const Text('Back'),
                ),
              ),
            if (_step > 0) const SizedBox(width: AppSpacing.md),
            Expanded(
              flex: _step > 0 ? 1 : 1,
              child: AppButton(
                label: _step == 3 ? 'Send for Signature' : 'Continue',
                onPressed: _canProceed ? () => _onStepContinue() : null,
                isLoading: _step == 3 && _isSending,
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool get _canProceed {
    return switch (_step) {
      0 => _selectedPartner != null,
      1 => true,
      2 => true,
      3 => true,
      _ => false,
    };
  }

  void _onStepContinue() {
    if (_step < 3) {
      setState(() => _step++);
    } else {
      _sendForSignature();
    }
  }
}

class _PartnerBarberTile extends StatelessWidget {
  const _PartnerBarberTile({
    required this.barber,
    required this.isSelected,
    required this.onTap,
  });

  final PartnershipEligibleBarber barber;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.sm),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.gold.withValues(alpha: 0.15) : AppColors.surface,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border.all(
            color: isSelected ? AppColors.gold : AppColors.divider,
          ),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: AppColors.divider,
              backgroundImage: barber.avatarUrl != null ? NetworkImage(barber.avatarUrl!) : null,
              child: barber.avatarUrl == null
                  ? Text(
                      barber.fullName.isNotEmpty ? barber.fullName[0].toUpperCase() : '?',
                      style: AppTextStyles.h3,
                    )
                  : null,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(barber.fullName, style: AppTextStyles.body),
                  if (barber.title != null) Text(barber.title!, style: AppTextStyles.caption),
                ],
              ),
            ),
            LevelBadge(level: barber.level, title: barber.title),
          ],
        ),
      ),
    );
  }
}
