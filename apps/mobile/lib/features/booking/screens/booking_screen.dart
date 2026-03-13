import 'package:flutter/material.dart';
import 'package:tapr/shared/widgets/placeholder_screen.dart';

class BookingScreen extends StatelessWidget {
  const BookingScreen({super.key, required this.barberId});

  final String barberId;

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(title: 'Book Barber: $barberId');
  }
}
