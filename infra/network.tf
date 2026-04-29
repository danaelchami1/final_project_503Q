resource "aws_vpc" "shopcloud_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-vpc"
  })
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.shopcloud_vpc.id

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-igw"
  })
}

resource "aws_subnet" "public_1" {
  vpc_id                  = aws_vpc.shopcloud_vpc.id
  cidr_block              = var.public_subnet_cidrs[0]
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-public-1"
    Tier = "public"
  })
}

resource "aws_subnet" "public_2" {
  vpc_id                  = aws_vpc.shopcloud_vpc.id
  cidr_block              = var.public_subnet_cidrs[1]
  availability_zone       = data.aws_availability_zones.available.names[1]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-public-2"
    Tier = "public"
  })
}

resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.shopcloud_vpc.id
  cidr_block        = var.private_subnet_cidrs[0]
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-private-1"
    Tier = "private"
  })
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.shopcloud_vpc.id
  cidr_block        = var.private_subnet_cidrs[1]
  availability_zone = data.aws_availability_zones.available.names[1]

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-private-2"
    Tier = "private"
  })
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.shopcloud_vpc.id

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-public-rt"
  })
}

resource "aws_route" "internet_access" {
  route_table_id         = aws_route_table.public_rt.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.igw.id
}

resource "aws_route_table_association" "public_assoc_1" {
  subnet_id      = aws_subnet.public_1.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "public_assoc_2" {
  subnet_id      = aws_subnet.public_2.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_eip" "nat_eip" {
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-nat-eip"
  })

  depends_on = [aws_internet_gateway.igw]
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat_eip.id
  subnet_id     = aws_subnet.public_1.id

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-nat"
  })

  depends_on = [aws_internet_gateway.igw]
}

resource "aws_route_table" "private_rt" {
  vpc_id = aws_vpc.shopcloud_vpc.id

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-private-rt"
  })
}

resource "aws_route" "nat_access" {
  route_table_id         = aws_route_table.private_rt.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.nat.id
}

resource "aws_route_table_association" "private_assoc_1" {
  subnet_id      = aws_subnet.private_1.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table_association" "private_assoc_2" {
  subnet_id      = aws_subnet.private_2.id
  route_table_id = aws_route_table.private_rt.id
}
